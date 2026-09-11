import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'
import { sendResponse } from './utilities/sendResponse.js'


const PORT = 8003

const __dirname = import.meta.dirname

const tasksFilePath = path.join(__dirname, 'data', 'tasks.json')


const server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE OPTIONS')

      if (req.method === 'OPTIONS') {
      res.statusCode = 204
      return res.end()
      }


      if (req.url === '/api/tasks' && req.method === 'GET') {

            try {
                  const tasksFile = await fs.readFile(tasksFilePath, 'utf8')
                  const parsedTasksFile = JSON.parse(tasksFile)

                  sendResponse(
                        res,
                        200,
                        'application/json',
                        JSON.stringify(parsedTasksFile)
                  )

            } catch(err) {
                  console.log(err)
                  sendResponse(
                        res,
                        500,
                        'application/json',
                        JSON.stringify({error: 'There was an issue with the server'})
                  )
            }

      }


      //      --APIs to build--
      //GET    /api/tasks
      //POST   /api/tasks
      //PATCH  /api/tasks/:id
      //DELETE /api/tasks/:id


})

server.listen(PORT, () => console.log(`Connected on port: ${PORT}`))