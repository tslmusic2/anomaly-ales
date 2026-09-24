import path from 'node:path'
import fs from 'node:fs/promises'
import http from 'node:http'
import { pool } from './utilities/database.js'
import { sendResponse } from './utilities/sendResponse.js'
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


		//------------------------------POST Handler-------------------------//
		if (req.url === '/api/orders' && req.method === 'POST') {

			const parsedreqBody = await getRequestBody(req)

			const inventoryFile = await fs.readFile(inventoryFilePath, 'utf8')
			const parsedInventoryFile = JSON.parse(inventoryFile)


			//Find ordered product ids then find product in inventory
			for (const orderedItem of parsedreqBody.items) {
				const product = parsedInventoryFile.find(
					product => product.id === orderedItem.id
				)

				if(!product) {
					return sendResponse(
						res,
						404,
						'application/json',
						JSON.stringify({error: 'Item does not exist'})
					)
				}
				//see if there is a valid quantity for the product ordered
				if (orderedItem.quantity <= 0) {
					return sendResponse(
						res,
						400,
						'application/json',
						JSON.stringify({error: 'Invalid quantity'})
					)
				}

				//see if amount ordered is in stock
				if (product.quantity < orderedItem.quantity) {
					return sendResponse(
						res,
						409,
						'application/json',
						JSON.stringify({error: 'There was an error with the server'})
					)
				} 	
			}

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


		//------------------------------PATCH Handler-------------------------//
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


			const allowedFields = ['product_type', 'img_url', 'name', 'beer_style', 'abv', 'packaging_type', 'size', 'quantity', 'unit_price', 'is_active']
			

			const reqBodyArr = Object.keys(parsedReqBody)

			//!!!!!!!!!!!!!NEED TO FIX THIS VALIDATION SECTION!!!!!!!!!!!!!!
			if (!allowedFields.includes(reqBodyArr.key) || reqBodyArr.some(key => key != allowedFields.value)) {
				return sendResponse(
					res,
					400,
					'application/json',
					JSON.stringify({ message: 'Invalid entry' })
				)
			}

			

			
			try {

				const result = await pool.query(`
					UPDATE quantity FROM inventory
						WHERE quantity = $1
					`)

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


		}





		//------------------------------DELETE Handler-------------------------//

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


			return sendResponse(
				res,
				200,
				'application/json',
				JSON.stringify({message: 'Product deleted successfully'})
			)

		}

		return sendResponse(
			res,
			404,
			'application/json',
			JSON.stringify({ message: 'Route not found' })
			)

 
		
	}  catch (err) {
		console.log(err) 
		sendResponse(
			res,
			500,
			'application/json',
			JSON.stringify({message: 'Internal Server Error'})
		)
	}



})

server.listen(PORT, () => console.log(`Connected on port: ${PORT}`))