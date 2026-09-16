import path from 'node:path'
import fs from 'node:fs/promises'
import http from 'node:http'
import { sendResponse } from './utilities/sendResponse.js'


const PORT = 8004

const __dirname = import.meta.dirname
const inventoryFilePath = path.join(__dirname, 'data', 'inventory.js')

const server = http.createServer(async (req, res) => {





})

server.listen(PORT, () => console.log(`Connected on port: ${PORT}`))