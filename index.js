"use strict"

var nodemailer = require("nodemailer")
var Indexer = require('stupid-indexer')
var EventEmitter = require('events').EventEmitter

var login_status = {
	NOTHING_YET: 'NOTHING_YET',
	EMAIL_SENT: 'EMAIL_SENT',
	LOGGED_IN: 'LOGGED_IN',
	LOGGED_OUT: 'LOGGED_OUT'
}

// Courtesy of LouisT
function UUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
		return v.toString(16)
	})
}

function PublicSession(session) {
	var self = this
	this.getStatus = function() {
		return session.status
	}
	this.getSessionKey = function() {
		return session.session_key
	}
	this.logout = function() {
		session.status = login_status.LOGGED_OUT
	}
	this.loggedIn = function() {
		return session.status === login_status.LOGGED_IN
	}
	session.on('login', function() {
		self.emit('login')
	})
	session.on('logout', function() {
		self.emit('logout')
	})
}

require('util').inherits(PublicSession, EventEmitter)

function Session(email_address) {
	this.session_key = UUID()
	this.authentication_key = UUID()
	this.status = login_status.NOTHING_YET
	this.email_address = email_address
}

require('util').inherits(Session, EventEmitter)

Session.prototype.logout = function() {
	this.status = login_status.LOGGED_OUT
	this.emit('logout')
}

function URLBuilder(base_url_object) {
	var url = require('url')
	var my_copy = Object.getOwnPropertyNames(base_url_object).reduce(function(memo, property) {
		memo[property] = base_url_object[property]
		return memo
	}, {})
	var base_search = base_url_object.search
	var base_query = base_url_object.query
	this.getNewURL = function(key) {
		if (typeof base_search === 'string') {
			my_copy.search = base_search + '&key=' + key
		} else {
			my_copy.key = key
		}
		return url.format(my_copy)
	}
}

function Authenticator(transport_type, transport_options, mail_options, base_url) {
	var transport = nodemailer.createTransport(transport_type, transport_options)
	var storage = new Indexer(['session_key', 'authentication_key'], ['email_address'])
	var url_builder = new URLBuilder(base_url)
	var message_text = mail_options.text || "Click here to log in! {{url}}"

	var sendEmail = function(session) {
		mail_options.to = session.email_address
		mail_options.text = message_text.replace('{{url}}', url_builder.getNewURL(session.authentication_key))
		transport.sendMail(mail_options)
		session.status = login_status.EMAIL_SENT
	}

	this.authenticate = function(authentication_key) {
		var session = storage.retrieve('authentication_key', authentication_key)

		if (session) {
			if (session.status !== login_status.LOGGED_OUT && session.status !== login_status.LOGGED_IN) {
				session.status = login_status.LOGGED_IN
				session.emit('login')
			}
			return new PublicSession(session)
		} else {
			return false
		}
	}

	this.handleRequest = function(req, res) {
		var url = require('url').parse(req.url, true)
		var public_session = false

		if (url.query.key) {
			public_session = this.authenticate(url.query.key)
		}

		if (public_session && public_session.loggedIn()) {
			res.write("You're logged in!")
		} else {
			res.write("Hey, you can't log in, I guess!")
		}

		res.end()
	}

	this.newLogin = function(email_address) {
		var session = new Session(email_address.toLowerCase())
		sendEmail(session)
		storage.store(session)
		return new PublicSession(session)
	}

	this.getSession = function(session_key, email_address) {
		var session = storage.retrieve('session_key', session_key)
		return (session && session.email_address === email_address.toLowerCase()) ? new PublicSession(session) : null
	}
}

module.exports = Authenticator