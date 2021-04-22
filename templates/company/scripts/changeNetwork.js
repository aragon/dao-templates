var fs = require('fs');

var arapp=JSON.parse(fs.readFileSync("arapp.json"))

arapp["environments"]["default"]["registry"] = process.env.APPLICATION_COMPANY_ADDRESS
arapp["environments"]["default"]["wsRPC"] = process.env.WEB3_WS_URL

fs.writeFileSync("./arapp.json",JSON.stringify(arapp,0,2))
