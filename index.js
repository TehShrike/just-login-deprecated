"use strict"

var nodemailer = require("nodemailer")
//var Indexer = require('stupid-indexer')
var Indexer = require('../stupid-indexer/index.js')
var EventEmitter = require('events').EventEmitter
var cookie = require('cookie')

var login_status = {
	NOTHING_YET: 'NOTHING_YET',
	EMAIL_SENT: 'EMAIL_SENT',
	LOGGED_IN: 'LOGGED_IN',
	LOGGED_OUT: 'LOGGED_OUT'
}

var key_cookie_name = 'just-login-key'
var email_cookie_name = 'just-login-email'

// Courtesy of LouisT
function UUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
		return v.toString(16)
	})
}

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

Session.prototype.login = function() {
	this.status = login_status.LOGGED_IN
	this.emit('login')
}

function PublicSession(session) {
	this.getSessionKey = function() { return session.session_key }
	this.getStatus = function() { return session.status }
	this.getEmailAddress = function() { return session.email_address }
	this.loggedIn = function() { return session.status === login_status.LOGGED_IN }
	
	this.logout = function() { session.logout() }
	
	var self = this
	session.on('login', function() { self.emit('login') })
	session.on('logout', function() { self.emit('logout') })
}

require('util').inherits(PublicSession, EventEmitter)

function URLBuilder(base_url_object, get_parameter) {
	var url = require('url')
	var base_search = base_url_object.search
	var base_query = base_url_object.query
	var my_copy = Object.getOwnPropertyNames(base_url_object).reduce(function(memo, property) {
		memo[property] = base_url_object[property]
		return memo
	}, {})
	
	if (typeof base_search === 'string') {
		base_search +=  (base_search.length > 0 ? '&' : '?') + get_parameter + '='
	}
	
	this.getNewURL = function(key) {
		if (typeof base_search === 'string') {
			my_copy.search = base_search + key
		} else {
			my_copy.key = key
		}
		return url.format(my_copy)
	}
}

function Authenticator(transport_type, transport_options, mail_options, base_url, options) {
	var self = this
	//var cookie_domain = base_url.hostname || base_url.host
	options = options || {}
	options.get_parameter = options.get_parameter || 'key'
	options.client_action = options.client_action || 'close'

	var transport = nodemailer.createTransport(transport_type, transport_options)
	var storage = new Indexer(['session_key', 'authentication_key'], ['email_address'])
	var url_builder = new URLBuilder(base_url, options.get_parameter)
	var message_text = mail_options.text || "Click here to log in! {{url}}"

	var getSessionFromCookies = function(req, cb) {
		var cookies = cookie.parse(req.headers.cookie || '')
		if (typeof cookies[key_cookie_name] !== 'undefined' && typeof cookies[email_cookie_name] !== 'undefined') {
			self.getSession(cookies[key_cookie_name], cookies[email_cookie_name], cb)
		} else {
			cb(null)
		}
	}

	var setCookies = function(public_session, res) {
		var expiration_increment = 30 * 24 * 60 * 60 // 30 days mebbe?
		var expiration_date = new Date((new Date()).getTime() + (expiration_increment * 1000))
		var cookie_options = {
			expires: expiration_date,
			maxAge: expiration_increment
			//, domain: cookie_domain 
		}
		var key = cookie.serialize(key_cookie_name, public_session.getSessionKey(), cookie_options)
		var email = cookie.serialize(email_cookie_name, public_session.getEmailAddress(), cookie_options)
		res.setHeader("Set-Cookie", [key, email])
	}

	var sendEmail = function(session) {
		mail_options.to = session.email_address
		mail_options.text = message_text.replace('{{url}}', url_builder.getNewURL(session.authentication_key))
		transport.sendMail(mail_options)
		session.status = login_status.EMAIL_SENT
	}

	this.authenticate = function(authentication_key, cb) {
		var session = storage.retrieve('authentication_key', authentication_key)

		if (session) {
			if (session.status !== login_status.LOGGED_OUT && session.status !== login_status.LOGGED_IN) {
				session.login()
			}
			cb(new PublicSession(session))
		} else {
			cb(null)
		}
	}

	var moveCookiesForwardIfApplicable = function(session, res) {
		if (session && session.loggedIn()) {
			setCookies(session, res)
		}
	}

	// Loads the session from the cookies, if possible
	// If the cookies are not present, attempts to authenticate via the get parameters
	// If the get parameter is not present, sets the session to false
	this.handleRequest = function(req, res, cb) {
		var url = require('url').parse(req.url, true)
		getSessionFromCookies(req, function(session) {
			var current_session_is_not_logged_in = session === null || !session.loggedIn()
			if (current_session_is_not_logged_in && typeof url.query.key !== 'undefined') {
				self.authenticate(url.query.key, function(session) {
					moveCookiesForwardIfApplicable(session, res)
					cb(session)
				})
			} else {
				moveCookiesForwardIfApplicable(session, res)
				cb(session)
			}
		})
	}

	this.handleConnectRequest = function(req, res, next) {
		self.handleRequest(req, res, function(session) {
			req.session = session
			next()
		})
	}

	this.newLogin = function(email_address) {
		var session = new Session(email_address.toLowerCase())
		sendEmail(session)
		storage.store(session)
		return new PublicSession(session)
	}

	this.getSession = function(session_key, email_address, cb) {
		var session = storage.retrieve('session_key', session_key)
		cb((session && session.email_address === email_address.toLowerCase()) ? new PublicSession(session) : null)
	}

	this.getSessionsByEmailAddress = function(email_address, cb) {
		var user_sessions = storage.retrieve('email_address', email_address.toLowerCase())
		cb(user_sessions.map(function(session) {
			return new PublicSession(session)
		}))
	}
}

module.exports = Authenticator