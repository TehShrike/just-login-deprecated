"use strict"

var Login = require('./index.js')

var transport = {
	host: '',
	auth: {
		user: '',
		pass: ''
	}
}

var mail_options = {
	from: '',
	replyTo: '',
	subject: ''
}

var base_url = {
	protocol: 'http',
	host: 'yourdomain.com:8080',
	pathname: 'auth',
	search: 'stuff_that_doesnt_matter=butts'
}

var login = new Login('SMTP', transport, mail_options, base_url)

require('http').createServer(function(req, res) {
	login.handleRequest(req, res)
}).listen(8080)

var session = login.newLogin('me@JoshDuff.com')

session.on('login', function() {
	console.log("Oh look, that fellow logged in!  Smashing!")
})

setInterval(function() {
	console.log(session.getStatus())
}, 5000)