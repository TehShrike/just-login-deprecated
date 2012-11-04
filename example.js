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
	login.handleRequest(req, res, function(session) {
		if (session) {
			res.write("Your session status is " + session.getStatus() + "\n")
		}
		if (session && session.loggedIn()) {
			res.end("You're logged in!")
		} else {
			res.end("You're not logged in apparently!")
		}
	})
}).listen(8080)

var session = login.newLogin('your_email@lol.com')

session.on('login', function() {
	console.log("Oh look, that fellow logged in!  Smashing!  Logging out in a bit...")
	setTimeout(function() {
		session.logout()
	}, 17000)
})

session.on('logout', function() {
	console.log("I say, that fellow has logged out!")
})

setInterval(function() {
	console.log(session.getStatus())
}, 5000)
