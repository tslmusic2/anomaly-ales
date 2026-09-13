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
                  
                  
                  //const url = new URL(req.url, `http://${req.headers.host}`)

                  //const priority = url.searchParams.get('priority')
                  //const completed = url.searchParams.get('completed')


                  const tasksFile = await fs.readFile(tasksFilePath, 'utf8')
                  const parsedTasksFile = JSON.parse(tasksFile)

            /*
                  let tasksToSend = parsedTasksFile
                  if (priority) {
                        tasksToSend = tasksToSend.filter(task => {
                              return task.priority.toLowerCase() === priority.toLowerCase()
                        })
                  }


                  if (completed !== null) {
                        const completedBoolean = completed === 'true'
                        tasksToSend = tasksToSend.filter(task => {
                              return task.completed === completedBoolean
                        })
                  }
            */

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


      if(req.url.startsWith('/api/tasks/') && req.method === 'PATCH') {

            try {
                  const parsedReqBody = await readRequestBody(req)


                  const id = Number(req.url.split('/').pop())



                  const tasksDataFile = await fs.readFile(tasksFilePath, 'utf8')
                  const parsedtasksDataFile = JSON.parse(tasksDataFile)


                  const patchTask = parsedtasksDataFile.find(task => task.id === id)         


                  Object.assign(patchTask, parsedReqBody)


                  await fs.writeFile(tasksFilePath, JSON.stringify(parsedtasksDataFile, null, 2), 'utf8')

                  return sendResponse(
                        res,
                        200,
                        'application/json',
                        JSON.stringify({message: 'Your data update was successful'})
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
      


      if (req.url.startsWith('/api/tasks/') && req.method === 'DELETE') {


            try {

                  const id = Number(req.url.split('/').pop())


                  const tasksFile = await fs.readFile(tasksFilePath, 'utf8')
                  const parsedTasksFile = JSON.parse(tasksFile)

                  const updatedparsedTaskFile = parsedTasksFile.filter(task => task.id !== id)

                  await fs.writeFile(tasksFilePath, JSON.stringify(updatedparsedTaskFile, null, 2), 'utf8')

                  return sendResponse(
                        res,
                        200,
                        'application/json',
                        JSON.stringify({message:'The task was deleted successfully'})
                  )
            
            } catch(err) {
                  console.log(err) 
                  sendResponse(
                        res,
                        500,
                        'application/json',
                        JSON.stringify({error: 'Unable to delete item'})
                  )
            }

      }



      //      --APIs to build--
      //GET   /api/tasks  add query param capabilities?
      //POST   /api/tasks  ----------DONE
      //PATCH  /api/tasks/:id     ----------DONE
      //DELETE /api/tasks/:id


})

server.listen(PORT, () => console.log(`Connected on port: ${PORT}`))