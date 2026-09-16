export function sendResponse(res, statusCode, contentType, data) {
        res.statusCode = statusCode,
        res.setheader('Content-Type', contentType),
        res.end(data)
}