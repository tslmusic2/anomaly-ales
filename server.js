import path from 'node:path'
import fs from 'node:fs/promises'
import http from 'node:http'
import { sendResponse } from './utilities/sendResponse.js'
import { getRequestBody } from './utilities/getRequestBody.js'


const PORT = 8004

const __dirname = import.meta.dirname
const inventoryFilePath = path.join(__dirname, 'data', 'inventory.js')
const ordersFilePath = path.join(__dirname, 'data', 'orders.js')

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

			const inventoryFile = await fs.readFile(inventoryFilePath, 'utf8')
			const parsedInventoryFile = JSON.parse(inventoryFile)

			return sendResponse(
				res,
				200,
				'application/json',
				JSON.stringify(parsedInventoryFile)
			)
		}



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
				//see if amount ordered is more than 0
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
			orderedItems = []

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
				Math.max(...parsedOrdersFile.length.map(order => order.id)) + 1 : 1

			const newOrder = {
				id: newOrderId,
				items: orderedItems,
				price: priceTotal
			}

			parsedOrdersFile.push(newOrder)
			await fs.writeFile(parsedOrdersFile, 'utf8')

			await fs.writeFile(parsedInventoryFile, 'utf8')

			return sendResponse(
				res,
				201,
				'application/json',
				JSON.stringify({ 
					message: 'Order created successfully', order: newOrder})
			)

			
		}

		if (req.url === '/api/inventory' && req.method === 'DELETE') {


		}

 
		
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