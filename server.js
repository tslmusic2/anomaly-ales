import path from 'node:path'
import fs from 'node:fs/promises'
import http from 'node:http'
import { pool } from './utilities/database.js'
import { sendResponse, sendJson } from './utilities/responses.js'
import { getRequestBody } from './utilities/getRequestBody.js'


const PORT = 8004

const __dirname = import.meta.dirname
const inventoryFilePath = path.join(__dirname, 'data', 'inventory.json')
const ordersFilePath = path.join(__dirname, 'data', 'orders.json')


const result = await pool.query(
    'SELECT current_database() AS database_name'
)

const ADMIN_API_KEY = process.env.ADMIN_API_KEY

if (!ADMIN_API_KEY) {
    throw new Error('ADMIN_API_KEY is missing')
}

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

			return sendResponse(
				res,
				200,
				'application/json',
				JSON.stringify(inventory)
			)
		}


//------------------------------POST Handler------------------------------------------------//
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
					return sendJson(res, 400, {error: 'Order must be valid JSON'})
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


			//-----------SQL Section-----------------------------
			const client = await pool.connect()

			try {

				//Check there is enough inventory to fill the order
				client.query(`
					SELECT quantity FROM inventory
						WHERE id = $1
					`)
				/*if (is--- < parsedReqBody.quantity) {
					//return sendJson(res, 400, { message: 'Insufficient inventory' })
				}*/

				//If inventorys good  update the inventory
				client.query(`
					UPDATE inventory
					SET quantity - $1
						WHERE id = $1;
					`)

				//add order info to orders table
				client.query(`
					INSERT INTO orders (
						order_date, order_status, order_items 
					) VALUES (
					 	TIMESTAMPTZ, 'pending', parsedReqBody.items
					);
					`)

				//Add ordered items to ordered_items table
				client.query(`
					SELECT quantity FROM inventory
						WHERE id = $1
					`)

			} catch(err) {

				throw err

			} finally {

				client.release()
			}
			








/*
			let priceTotal = 0
			const orderedItems = []

			//Find product in inventory then adjust its inventory and check price
			for (const orderedItem of parsedreqBody.items) {
				const product = parsedInventoryFile.find(
					product => product.id === orderedItem.id
				)


				//subtract the order quantity from quantity
				product.quantity -= orderedItem.quantity

				// Calculate this item's total
				const itemTotal = product.price * orderedItem.quantity

				//Add it to the entire order total
				priceTotal += itemTotal


				orderedItems.push({
					id: product.id,
					name: product.name,
					packageType: product.packageType,
					quantity: orderedItem.quantity,
					price: product.price,
					itemTotal: itemTotal
				})

			}
*/
			const ordersFile = await fs.readFile(ordersFilePath, 'utf8')
			const parsedOrdersFile = JSON.parse(ordersFile)

			const newOrderId = parsedOrdersFile.length > 0 ?
				Math.max(...parsedOrdersFile.map(order => order.id)) + 1 : 1

			const newOrder = {
				id: newOrderId,
				items: orderedItems,
				price: Math.round(priceTotal * 100) / 100
			}

			parsedOrdersFile.push(newOrder)
			await fs.writeFile(ordersFilePath, JSON.stringify(parsedOrdersFile, null, 2), 'utf8')

			await fs.writeFile(inventoryFilePath, JSON.stringify(parsedInventoryFile, null, 2), 'utf8')

			return sendResponse(
				res,
				201,
				'application/json',
				JSON.stringify({ 
					message: 'Order created successfully', order: newOrder})
			)

			
		}


//--------------------------------------PATCH Handler----------------------------------------------------------------//
		if (req.url.startsWith('/api/inventory') && req.method === 'PATCH') {

			//----------------------------------------------------------//
			if (!ADMIN_API_KEY || req.headers['x-admin-key'] !== ADMIN_API_KEY) {
				return sendResponse(
				res,
				403,
				'application/json',
				JSON.stringify({ message: 'Admin access required' })
				)
			}
			//----------------------------------------------------------//


			const id = Number(req.url.split('/').pop())

			if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
				return sendResponse(
					res,
					400,
					'application/json',
					JSON.stringify({ message: 'ID must be a positive integer' })
				)
			}


			const parsedReqBody = await getRequestBody(req)

			//includes ALL fields that can be accepted and altered in the table
			const allowedFields = ['product_type', 'img_url', 'name', 'beer_style', 'abv', 'packaging_type', 'size', 'quantity', 'unit_price', 'is_active']
			
			//Reject null, non-object values, and arrays.
			if ( parsedReqBody === null || typeof parsedReqBody !== 'object' || Array.isArray(parsedReqBody)) {
				return sendResponse(
					res,
					400,
					'application/json',
					JSON.stringify({ message: 'Request body must be a JSON object' })
				)
			}

			//Gets the keys out of the parsedReq array into an array of strings
			//Then makes sure theres something in the array to be updated
			const reqBodyArr = Object.keys(parsedReqBody)

			if (reqBodyArr.length === 0) {
				return sendResponse(
					res,
					400,
					'application/json',
					JSON.stringify({ message: 'Provide at least one field to update' })
				)
			}


			//Looks through the req body for a field that isnt accepted
			const hasInvalidField = reqBodyArr.some(field => !allowedFields.includes(field))

			if (hasInvalidField) {
				return sendResponse(
					res,
					400,
					'application/json',
					JSON.stringify({ message: 'Invalid entry' })
				)
			}


			//PRODUCT_TYPE  validates the product is beer or merchandise
			const hasProductType = Object.hasOwn(parsedReqBody, 'product_type')
			const productTypeValue = parsedReqBody.product_type
			if(hasProductType) {
				if (productTypeValue !== 'beer' && productTypeValue !== 'merchandise') {
					return sendResponse(
							res,
							400,
							'application/json',
							JSON.stringify({ message: 'Invalid product type' })
						)
				}
			}

			//IMG_URL  validates the img_url
			const hasImgUrl = Object.hasOwn(parsedReqBody, 'img_url')
			const imgUrlValue = parsedReqBody.img_url
			if(hasImgUrl) {
				if (imgUrlValue !== null && (typeof imgUrlValue !== 'string' || imgUrlValue.trim().length === 0)) {
					return sendResponse(
							res,
							400,
							'application/json',
							JSON.stringify({ message: 'Image URL must be a nonempty string or null' })
						)
				}
			}

			//NAME  validates the name
			const hasName = Object.hasOwn(parsedReqBody, 'name')
			const nameValue = parsedReqBody.name
			if (hasName) {
				if (typeof nameValue !== 'string' || nameValue.trim().length === 0) {
					return sendResponse(
							res,
							400,
							'application/json',
							JSON.stringify({ message: 'Name must be a non empty string' })
						)
				}
			}

			//ABV  validates abv
			const hasAbv = Object.hasOwn(parsedReqBody, 'abv')
			const abvValue = parsedReqBody.abv

			if(hasAbv) {
				if(abvValue !== null && (!Number.isFinite(abvValue) || abvValue < 0 || abvValue > 99)) {
					return sendResponse(
							res,
							400,
							'application/json',
							JSON.stringify({ message: 'ABV must be a number between 0 and 99, or null' })
						)
				}
			}


			//validates beer_style, packaging_type, size   
			const stylePackSizeArr = ['beer_style', 'packaging_type', 'size']

			for (const field of stylePackSizeArr) {
				const fieldExists = Object.hasOwn(parsedReqBody, field)
				const value = parsedReqBody[field]
				
				if(fieldExists) {
					if(value !== null && (typeof value !== 'string' || value.trim().length === 0)) {
						return sendResponse(
						res,
						400,
						'application/json',
						JSON.stringify({ message: `${field} must be a non empty string or null` })
					)
					}
				}
			}

			//QUANTITY   validates a quantity if there is one.  That its an integer between 0 and 2147483647
			const hasQuantity = Object.hasOwn(parsedReqBody, 'quantity')

			if (hasQuantity) {
				const quantityValue = parsedReqBody.quantity
				if (!Number.isInteger(quantityValue) || quantityValue < 0 || quantityValue > 2147483647) {
					return sendResponse(
						res,
						400,
						'application/json',
						JSON.stringify({ message: 'Quantity must be an integer between 0 and 2147483647' })
					)
				}
			}

			//UNIT_PRICE  validates unit_price
			const hasUnitPrice = Object.hasOwn(parsedReqBody, 'unit_price')
			const unitPriceValue = parsedReqBody.unit_price

			if(hasUnitPrice) {
				if(!Number.isFinite(unitPriceValue) || unitPriceValue < 0 || unitPriceValue > 99999999.99) {
					return sendResponse(
							res,
							400,
							'application/json',
							JSON.stringify({ message: 'Unit price must be a valid number' })
						)
				}
			}


			const hasIsActive = Object.hasOwn(parsedReqBody, 'is_active')
			const isActiveValue = parsedReqBody.is_active
			if (hasIsActive) {
				if (typeof isActiveValue !== 'boolean') {
					return sendResponse(
						res,
						400,
						'application/json',
						JSON.stringify({ message: 'Value must be true or false' })
					)
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
				return sendResponse(
					res,
					404,
					'application/json',
					JSON.stringify({ message: 'ID not found' })
				)
			}

			return sendResponse(
				res,
				200,
				'application/json',
				JSON.stringify({message: 'Product updated successfully',product: result.rows[0]})
			)


		}





		//------------------------------DELETE Handler------------------------------------------------------------------//

		if (req.url.startsWith('/api/inventory') && req.method === 'DELETE') {

			//----------------------------------------------------------//
			if (!ADMIN_API_KEY || req.headers['x-admin-key'] !== ADMIN_API_KEY) {
				return sendResponse(
				res,
				403,
				'application/json',
				JSON.stringify({ message: 'Admin access required' })
				)
			}
			//----------------------------------------------------------//

			const id = Number(req.url.split('/').pop())

			if (!Number.isInteger(id) || id <= 0) {
				return sendResponse(
					res,
					400,
					'application/json',
					JSON.stringify({ message: 'ID must be a positive integer' })
				)
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
					return sendResponse(
						res,
						409,
						'application/json',
						JSON.stringify({message: 'This product is referenced by an order and cannot be deleted.'})
					)
				}

				throw err
			}


			
			if(result.rowCount === 0 ) {
				return sendResponse(
					res,
					404,
					'application/json',
					JSON.stringify({ message: 'ID not found' })
				)
			}


			return sendJson(res, 200, {message: 'Product deleted successfully'})

		}

		return sendJson(res, 404, { message: 'Route not found' })

		
	}  catch (err) {
		console.log(err) 
		return sendJson(res, 500, {message: 'Internal Server Error'})
	}



})

server.listen(PORT, () => console.log(`Connected on port: ${PORT}`))