var express = require('express');
var router = express.Router();

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var mysql = require('mysql');


router.post('/login', function(req, res, next) {

	mysqlModel = mysql.createPool(config);
	mysqlModel.getConnection(function(err,connection) {
		if (err || !connection){
			res.status(401)
			connection.end();
			return res.json({error:'DB connection error. Check DB config file'}); 
		}
		else
		{
			passport.authenticate('local', function(err, user, info) {
				if (err) { return next(err); }
				if (!user) { 
					res.status(401)
					return res.json({error:'Invalid username / password'}); 
				}
				req.logIn(user, function(err) {
					if (err) { return next(err); }
					res.status(200)
					return res.json({msg:'success'}); 
				});
			})(req, res, next);
		}
	});

	
});

router.get('/logout', function(req, res, next) {
	req.logOut();
  	res.status(200)
	return res.json({msg:'logout success'}); 
});

module.exports = router;
