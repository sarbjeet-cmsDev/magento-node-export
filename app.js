var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var _ = require('underscore');
var fs = require('fs');

var async = require('async');
var session = require('express-session');
var FileStore = require('session-file-store')(session);

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var mysql = require('mysql');

var crypto = require('crypto');
var md5 = require('md5');

var config = JSON.parse(fs.readFileSync('./config/database.json', 'utf8'));

global._ = _;
global.async = async;
global.config = config;



var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'keyboardcat',
  resave: true,
  saveUninitialized: true
}));



app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user.username);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

passport.use(new LocalStrategy(function(username, password, done) {
        
        var mysqlModel = mysql.createPool(config);
        
        mysqlModel.getConnection(function(err,connection) {
            connection.query('SELECT * FROM admin_user WHERE username = "'+username+'";', function(err, rows) {
                
                $hash = rows[0].password;
                $hash = $hash.split(":");

                $cecheck = md5(_.last($hash) + password);
                $eecheck = crypto.createHmac('sha256',_.last($hash) + password);

                $valid=($cecheck == _.first($hash) || $eecheck== _.first($hash) );

                if($valid)
                {
                    return done(null, rows[0]);
                }
                else
                    return done(null, false);

            });
            connection.end();
        });
    }
)); 

function isAuthenticated(req, res, next) {
    if (req.user)
        return next();
    res.status(400);
    res.send('unauthorized');
}




var eav = require('./routes/eav');
var user = require('./routes/users');


//set routers
app.use('/eav',isAuthenticated, eav);
app.use('/user', user);

app.get('/', function(req, res) {
    res.sendfile('./public/index.html'); // load the single view file (angular will handle the page changes on the front-end)
});



// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});





app.listen(3000);

module.exports = app;
