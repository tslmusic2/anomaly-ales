export function sendResponse(res, statusCode, contentType, data) {
        res.statusCode = statusCode,
        res.setHeader('Content-Type', contentType),
        res.end(data)
}