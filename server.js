import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'
import { sendResponse } from './utilities/sendResponse.js'
import { readRequestBody } from './utilities/readRequestBody.js'


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

console.log(req.method, req.url)

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
                  return sendResponse(
                        res,
                        500,
                        'application/json',
                        JSON.stringify({error: 'There was an issue with the server'})
                  )
            }

      }


      if (req.url === '/api/tasks' && req.method === 'POST') {

            try {

                  const parsedBody = await readRequestBody(req)
                  const {task, priority} = parsedBody



                  const tasksListFile = await fs.readFile(tasksFilePath, 'utf8')
                  const parsedTasksListFile = JSON.parse(tasksListFile)


                  const newID = parsedTasksListFile.length > 0 ? Math.max(...parsedTasksListFile.map(task => task.id)) + 1 : 1

                  const newIdObj = {
                        id: newID,
                        task: task,
                        completed: false,
                        priority: priority
                  }


                  parsedTasksListFile.push(newIdObj)

                  await fs.writeFile(tasksFilePath, JSON.stringify(parsedTasksListFile, null, 2), 'utf8')

                  return sendResponse(
                        res,
                        200,
                        'application/json',
                        JSON.stringify({message: 'Your task was succesfully added'})
                  )


            } catch(err) {
                  console.log(err)
                  return sendResponse(
                        res,
                        500,
                        'applicatin/json',
                        JSON.stringify({error: 'There was an issue with the server'})
                  )
            }


      }





      //      --APIs to build--
      //GET --DONE    /api/tasks  add query param capabilities?
      //POST   /api/tasks  ----------DONE
      //PATCH  /api/tasks/:id
      //DELETE /api/tasks/:id


})

server.listen(PORT, () => console.log(`Connected on port: ${PORT}`))