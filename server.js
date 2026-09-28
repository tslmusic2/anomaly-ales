import http from 'node:http'
import { pool } from './utilities/database.js'
import { sendJson } from './utilities/responses.js'
import { getRequestBody } from './utilities/getRequestBody.js'


const PORT = 8004

const ADMIN_API_KEY = process.env.ADMIN_API_KEY
if (!ADMIN_API_KEY) {
    throw new Error('ADMIN_API_KEY is missing')
}


const result = await pool.query(
    'SELECT current_database() AS database_name'
)



console.log('Connected to database:', result.rows[0].database_name)

const server = http.createServer(async (req, res) => {
      //Here so this works on my local network----------
	res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE OPTIONS')

      if (req.method === 'OPTIONS') {
      res.statusCode = 204
      return res.end()
      }
	//-------------------------------------------------


	try {

		if (req.url === '/api/inventory' && req.method === 'GET') {

			const result = await pool.query(
				`SELECT id,product_type,img_url,
					name,beer_style,abv,packaging_type,
					size,unit_price
					FROM inventory;`
			)

			const inventory = result.rows

			return sendJson(res, 200, inventory)
		}




//------------------------------POST USER ORDERS Handler------------------------------------------------//
		if (req.url === '/api/orders' && req.method === 'POST') {


			//This section makes sure the request itself is valid 
			let parsedReqBody
			try {

				parsedReqBody = await getRequestBody(req)

			
				if (parsedReqBody === null || typeof parsedReqBody !== 'object' || Array.isArray(parsedReqBody)) {
					return sendJson(res, 400, {message: 'Request body must be a JSON object'})
				}

				if (!Array.isArray(parsedReqBody.items) || parsedReqBody.items.length === 0) {
					return sendJson(res, 400, {message: 'Order must contain a nonempty items array'})
				}

			} catch(err) {
				if (err instanceof SyntaxError) {
					return sendJson(res, 400, {message: 'Order must be valid JSON'})
				}

				throw err
			}


			//This section makes sure the ordered items are in fact valid
			const seenIds = new Set()
			for (const orderedItem of parsedReqBody.items) {
				
				//validate the ordered items a non null object
				if (typeof orderedItem !== 'object' || orderedItem === null|| Array.isArray(orderedItem)) {
					return sendJson(res, 400, {message: 'each order item must be a non null object'})
				}

				//validate the id
				if (!Number.isInteger(orderedItem.id) || orderedItem.id <= 0 || orderedItem.id > 2147483647) {
					return sendJson(res, 400, { message: 'id must be an integer between 1 and 2147483647' })
				}



				//validate the quantity
				if (!Number.isInteger(orderedItem.quantity) || orderedItem.quantity <= 0 || orderedItem.quantity > 2147483647) {
					return sendJson(res, 400, { message: 'Quantity must be an integer between 1 and 2147483647' })
				}

				//validate the id is not a duplicate
				if (seenIds.has(orderedItem.id)) {
					return sendJson(res, 400, { message: 'Each product ID must appear only once; combine its quantities into one item' })
				}

				seenIds.add(orderedItem.id)

			}


			//-----------SQL Section---------------------------------------------------
			const client = await pool.connect()

			try {

				await client.query('BEGIN')

				const inventoryIds = parsedReqBody.items.map(item => item.id)

				const inventoryResults = await client.query(`
					SELECT id, name, size, packaging_type, quantity, unit_price, is_active
					FROM inventory
						WHERE id = ANY($1::integer[])
					ORDER BY id
					FOR UPDATE 
					`, [inventoryIds])
					//$1 is our first parameter.
					//::integer[] tells PostgreSQL to treat it as an array of integers.
					//ANY(...) checks for a match against any member of that array.
					//FOR UPDATE -- locks in the items row so noone else can order/alter it until this transaction finishes!!

				const inventory = inventoryResults.rows

				if (inventory.length !== inventoryIds.length) {
					await client.query('ROLLBACK')
					return sendJson(res, 404, {message: 'One or more requested products do not exist'})
				}


				//checking active status and available stock
				for (const orderItem of parsedReqBody.items) { 
					const inventoryItem = inventory.find(item => item.id === orderItem.id)

					if(!inventoryItem.is_active) {
						await client.query('ROLLBACK')
						return sendJson(res, 409, {message: 'An order item is currently inactive'})
					}

					if(inventoryItem.quantity < orderItem.quantity) {
						await client.query('ROLLBACK')
						return sendJson(res, 409, {message: 'Not enough stock to fulfill order'})
					}
				}



				//add order info to orders table
				const orderResult = await client.query(`
					INSERT INTO orders DEFAULT VALUES
					RETURNING id, order_date, order_status; 
					`)

				const newOrder = orderResult.rows[0]

				
				
				//Add ordered items to ordered_items table
				for (const orderItem of parsedReqBody.items) {
					const inventoryItem = inventory.find(item => item.id === orderItem.id)
	
					await client.query(`
						INSERT INTO order_items (
							order_id, inventory_id, item_name, selected_size, packaging_type, quantity, unit_price 
						) VALUES (
							$1, $2, $3, $4, $5, $6, $7
						);
						`, [
							newOrder.id, 
							inventoryItem.id, 
							inventoryItem.name, 
							inventoryItem.size,
							inventoryItem.packaging_type, 
							orderItem.quantity,
							inventoryItem.unit_price
							]
						)

				//update the inventory
						await client.query(`
							UPDATE inventory
							SET quantity = quantity - $1
								WHERE id = $2;
							`, [orderItem.quantity, inventoryItem.id])

				}

				//gets the saved order items
				const orderItemsResult = await client.query(`
					SELECT inventory_id, item_name, selected_size, packaging_type, quantity, unit_price, quantity * unit_price AS item_total
					FROM order_items
						WHERE order_id = $1
						ORDER BY id;
					`, [newOrder.id])

				const orderItems = orderItemsResult.rows

				//gets the order total
				const orderTotalResult = await client.query(`
					SELECT SUM(quantity * unit_price) AS order_total FROM order_items
					  WHERE order_id = $1;
					`, [newOrder.id])

				const orderTotal = orderTotalResult.rows[0].order_total

				await client.query('COMMIT')

				return sendJson(res, 201, {message: 'Order was created successfully', order: newOrder, orderItems, orderTotal})

			} catch(err) {
				await client.query('ROLLBACK')
				throw err

			} finally {

				client.release()
			}

		}	
//------------------------------------END----------------------------------------------------------------------------//	

			
		


//--------------------------------------PATCH Handler----------------------------------------------------------------//
		if (req.url.startsWith('/api/inventory') && req.method === 'PATCH') {

			//----------------------------------------------------------//
			if (!ADMIN_API_KEY || req.headers['x-admin-key'] !== ADMIN_API_KEY) {
				return sendJson(res, 403, { message: 'Admin access required' })
			}
			//----------------------------------------------------------//


			const id = Number(req.url.split('/').pop())

			if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
				return sendJson(res, 400, { message: 'ID must be a positive integer' })
			}


			const parsedReqBody = await getRequestBody(req)

			//includes ALL fields that can be accepted and altered in the table
			const allowedFields = ['product_type', 'img_url', 'name', 'beer_style', 'abv', 'packaging_type', 'size', 'quantity', 'unit_price', 'is_active']
			
			//Reject null, non-object values, and arrays.
			if ( parsedReqBody === null || typeof parsedReqBody !== 'object' || Array.isArray(parsedReqBody)) {
				return sendJson(res, 400, { message: 'Request body must be a JSON object' })
			}

			//Gets the keys out of the parsedReq array into an array of strings
			//Then makes sure theres something in the array to be updated
			const reqBodyArr = Object.keys(parsedReqBody)

			if (reqBodyArr.length === 0) {
				return sendJson(res, 400, { message: 'Provide at least one field to update' })
			}


			//Looks through the req body for a field that isnt accepted
			const hasInvalidField = reqBodyArr.some(field => !allowedFields.includes(field))

			if (hasInvalidField) {
				return sendJson(res, 400, { message: 'Invalid entry' })
			}

//-----//-----///-----//------/-----//---Make utility for the Object.hasOwns ----//-----//-----//
			//PRODUCT_TYPE  validates the product is beer or merchandise
			const hasProductType = Object.hasOwn(parsedReqBody, 'product_type')
			const productTypeValue = parsedReqBody.product_type
			if(hasProductType) {
				if (productTypeValue !== 'beer' && productTypeValue !== 'merchandise') {
					return sendJson(res, 400, { message: 'Invalid product type' })
				}
			}

			//IMG_URL  validates the img_url
			const hasImgUrl = Object.hasOwn(parsedReqBody, 'img_url')
			const imgUrlValue = parsedReqBody.img_url
			if(hasImgUrl) {
				if (imgUrlValue !== null && (typeof imgUrlValue !== 'string' || imgUrlValue.trim().length === 0)) {
					return sendJson(res, 400, { message: 'Image URL must be a nonempty string or null' })
				}
			}

			//NAME  validates the name
			const hasName = Object.hasOwn(parsedReqBody, 'name')
			const nameValue = parsedReqBody.name
			if (hasName) {
				if (typeof nameValue !== 'string' || nameValue.trim().length === 0) {
					return sendJson(res, 400, { message: 'Name must be a non empty string' })
				}
			}

			//ABV  validates abv
			const hasAbv = Object.hasOwn(parsedReqBody, 'abv')
			const abvValue = parsedReqBody.abv

			if(hasAbv) {
				if(abvValue !== null && (!Number.isFinite(abvValue) || abvValue < 0 || abvValue > 99)) {
					return sendJson(res, 400, { message: 'ABV must be a number between 0 and 99, or null' })
				}
			}
//------///--------//-------//------//-------//------//------//-------//

			//validates beer_style, packaging_type, size   
			const stylePackSizeArr = ['beer_style', 'packaging_type', 'size']

			for (const field of stylePackSizeArr) {
				const fieldExists = Object.hasOwn(parsedReqBody, field)
				const value = parsedReqBody[field]
				
				if(fieldExists) {
					if(value !== null && (typeof value !== 'string' || value.trim().length === 0)) {
						return sendJson(res, 400, { message: `${field} must be a non empty string or null` })
					}
				}
			}

			//QUANTITY   validates a quantity if there is one.  That its an integer between 0 and 2147483647
			const hasQuantity = Object.hasOwn(parsedReqBody, 'quantity')

			if (hasQuantity) {
				const quantityValue = parsedReqBody.quantity
				if (!Number.isInteger(quantityValue) || quantityValue < 0 || quantityValue > 2147483647) {
					return sendJson(res, 400, { message: 'Quantity must be an integer between 0 and 2147483647' })
				}
			}

			//UNIT_PRICE  validates unit_price
			const hasUnitPrice = Object.hasOwn(parsedReqBody, 'unit_price')
			const unitPriceValue = parsedReqBody.unit_price

			if(hasUnitPrice) {
				if(!Number.isFinite(unitPriceValue) || unitPriceValue < 0 || unitPriceValue > 99999999.99) {
					return sendJson(res, 400, { message: 'Unit price must be a valid number' })
				}
			}


			const hasIsActive = Object.hasOwn(parsedReqBody, 'is_active')
			const isActiveValue = parsedReqBody.is_active
			if (hasIsActive) {
				if (typeof isActiveValue !== 'boolean') {
					return sendJson(res, 400, { message: 'Value must be true or false' })
				}
			}


		//--------------------SQL query code HERE----------------------//

			const assignments = reqBodyArr.map((field,index) => `${field} = $${index + 1}`)

			const values = reqBodyArr.map(field => parsedReqBody[field])
			values.push(id)
			

			const query = `
				UPDATE inventory
				SET ${assignments.join(', ')}
				WHERE id = $${values.length}
				RETURNING *;
			`

			const result = await pool.query(query, values)

			if (result.rowCount === 0) {
				return sendJson(res, 404, { message: 'ID not found' })
			}

			return sendJson(res, 201, {message: 'Product updated successfully',product: result.rows[0]})

		}





		//------------------------------DELETE Handler------------------------------------------------------------------//

		if (req.url.startsWith('/api/inventory') && req.method === 'DELETE') {

			//----------------------------------------------------------//
			if (!ADMIN_API_KEY || req.headers['x-admin-key'] !== ADMIN_API_KEY) {
				return sendJson(res, 403, { message: 'Admin access required' })
			}
			//----------------------------------------------------------//

			const id = Number(req.url.split('/').pop())

			if (!Number.isInteger(id) || id <= 0) {
				return sendJson(res, 400, { message: 'ID must be a positive integer' })
			}
	
			let result

			try {
				//result will tell us how many rows were deleted
				result = await pool.query(`
					DELETE FROM inventory
						WHERE id = $1;`, [id]
					)

			} catch (err) {
				if (err.code === '23503') {
					return sendJson(res, 409, {message: 'This product is referenced by an order and cannot be deleted.'})
				}

				throw err
			}


			
			if(result.rowCount === 0 ) {
				return sendJson(res, 404, { message: 'ID not found' })
			}


			return sendJson(res, 200, {message: 'Product deleted successfully'})

		}




//------------------------------POST ADMIN INVENTORY Handler------------------------------------------------//
		if (req.url === '/api/inventory' && req.method === 'POST') {

			//----------------------------------------------------------//
			if (!ADMIN_API_KEY || req.headers['x-admin-key'] !== ADMIN_API_KEY) {
				return sendJson(res, 403, { message: 'Admin access required' })
			}
			//----------------------------------------------------------//


			//validate that its proper json and contains something
			let parsedReqBody
			try {
				parsedReqBody = await getRequestBody(req)

				if (parsedReqBody === null || typeof parsedReqBody !== 'object' || Array.isArray(parsedReqBody)) {
					return sendJson(res, 400, {message: 'Request body must contain valid JSON'})
				}

			} catch(err) {
				if (err instanceof SyntaxError) {
					return sendJson(res, 400, {message: 'Request body must contain valid JSON'})
				}

				throw err
			}


			const allowedFields = ['product_type', 'img_url', 'name', 'beer_style', 'abv', 'packaging_type', 'size', 'quantity', 'unit_price', 'is_active']
			const requiredFields = ['product_type', 'name', 'quantity', 'unit_price']
			

			for (const field of requiredFields) {
				const validField = Object.hasOwn(parsedReqBody, field)

				if (!validField) {
					return sendJson(res, 400, {message: `${field} is required`})
				}
			}
			
			const parsedReqArr = Object.keys(parsedReqBody)

			for (const field of parsedReqArr) {
				const allowedValue = allowedFields.includes(field)
			
				if (!allowedValue) {
					return sendJson(res, 400, {message: `${field} is not an allowed inventory field`})
				}

			}


				//'product_type', 
			if (parsedReqBody.product_type !== 'beer' && parsedReqBody.product_type !== 'merchandise') {
				return sendJson(res, 400, {message: 'product_type must be beer or merchandise'})
			}

				// 'name', 
			if (typeof parsedReqBody.name !== 'string' || parsedReqBody.name.trim().length === 0) {
				return sendJson(res, 400, {message: 'name must be a non empty string'})
			}


				// 'quantity', 
			if (!Number.isInteger(parsedReqBody.quantity) || parsedReqBody.quantity < 0 || parsedReqBody.quantity > 2147483647) {
				return sendJson(res, 400, {message: 'quantity must be an integer between 0 and 2147483647'})
			}



				// 'unit_price'
			if (!Number.isFinite(parsedReqBody.unit_price) || parsedReqBody.unit_price < 0 || parsedReqBody.unit_price > 99999999.99) {
				return sendJson(res, 400, {message: 'unit_price must be a number between 0 and 99999999.99'})
			}

				//img_url
			const hasImg = Object.hasOwn(parsedReqBody, 'img_url')
			if (hasImg) {
				if (parsedReqBody.img_url !== null && (typeof parsedReqBody.img_url !== 'string' || parsedReqBody.img_url.trim().length === 0)) {
					return sendJson(res, 400, {message: 'img_url must be a non empty string or null'})
				}

			}

				//'beer_style','packaging_type', 'size'
			const stylePackSize = ['beer_style','packaging_type', 'size']
			
			for (const field of stylePackSize) {
				const hasField = Object.hasOwn(parsedReqBody, field)
				const value = parsedReqBody[field]
				if (hasField) {
					if (value !== null && (typeof value !== 'string' || value.trim().length === 0)) {
						return sendJson(res, 400, {message: `${field} must be a non empty string or null`})
					}
				}
			}

				// 'abv', 
			const hasAbv = Object.hasOwn(parsedReqBody, 'abv')
			if (hasAbv) {
				if (parsedReqBody.abv !== null && (!Number.isFinite(parsedReqBody.abv) || parsedReqBody.abv < 0 || parsedReqBody.abv > 99)) {
					return sendJson(res, 400, {message: 'abv must be a number between 0 and 99 or null'})
				}
			}

			//is_active
			const hasIsActive = Object.hasOwn(parsedReqBody, 'is_active')
			if (hasIsActive) {
				if (typeof parsedReqBody.is_active !== 'boolean') {
					return sendJson(res, 400, {message: 'is_active must be true or false'})
				}
			}
			
			//-------SQL for adding the product to database-------//

			const insertFields = parsedReqArr.join(', ')
			const placeholders = parsedReqArr.map((field, index) => `$${index + 1}`).join(', ')
			const insertValues = Object.values(parsedReqBody)
			    //OR USE const insertValues = parsedReqArr.map(field => parsedReqBody[field])

			const result = await pool.query(`
				INSERT INTO inventory (
					${insertFields}
				) VALUES (
				 	${placeholders}
				)
				RETURNING * ;`, insertValues)

				const resultRows = result.rows[0]
			
			return sendJson(res, 201, {message: 'Inventory added successfully', product: resultRows})
			
				


			
			

		}
		//------------------------------------------------------------------



		return sendJson(res, 404, { message: 'Route not found' })

		
	}  catch (err) {
		console.log(err) 
		return sendJson(res, 500, {message: 'Internal Server Error'})
	}



})

server.listen(PORT, () => console.log(`Connected on port: ${PORT}`))