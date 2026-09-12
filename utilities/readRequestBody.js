export async function readRequestBody(req) {

        let body = ''

        for await (const chunk of req) {
                body += chunk.toString()
        }

        return JSON.parse(body)

}