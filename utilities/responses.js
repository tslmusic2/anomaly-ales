export function sendResponse(res, statusCode, contentType, data) {
        res.statusCode = statusCode,
        res.setHeader('Content-Type', contentType),
        res.end(data)
}



export function sendJson(res, statusCode, data) {
        sendResponse(
                res, 
                statusCode, 
                'application/json', 
                JSON.stringify(data))
}