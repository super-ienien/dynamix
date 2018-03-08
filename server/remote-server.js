"use strict";

var    Util = require ('../helpers/util')
    ,  User = require ('../models/user')
    ,  Server = require ('../server')
    ,  RemoteSocket = require('./remote-socket')
    ,  Modulator = require ('../modulator');

var servers = {};


exports.createServer = function (config)
{
    let namespace = config.namespace || "/"+config.name;
    if (servers.hasOwnProperty(namespace)) return;

    console.log ('CREATE IO SERVER ' + namespace);

    var io = servers[namespace] = Server.of(namespace);
    console.log ('IO Namespace creation : '+namespace);
    //Authentification
    io.use(function(socket, next)
    {
        let sock = socket;
        let cookies = Util.parseCookies(socket.request.headers.cookie);
        User.getOne({cookie: cookies.tuituit}).then(function (user)
        {
            sock.user = user;
            if (!user.hasAuthorizedModule(config.name))
            {
                console.log (user.name() + ' is not authorized to access '+config.name);
                return next(new Error('Not authorized'));
            }
            if (config.monoSocket && user.connected)
            {
                for (var i in user.sockets)
                {
                    if (user.sockets[i].socket.handshake.query.uid == sock.handshake.query.uid)
                    {
                        console.log('Handshake Reconnection : '+ namespace + ' - '+user.name());
                        var oldSock = user.sockets[i].socket;
                        oldSock.on('disconnect', function()
                        {
                            return next();
                        });
                        oldSock.disconnect();
                        return;
                    }
                }
                console.log(namespace + ' is alive ? ' + user.name());
                user.isAlive().then(function ()
                {
                    console.log('Handshake Failed user is alive');
                    return next(new Error('Authentication error'));
                }, next)
                .catch(function (error)
                {
                    console.log(error.stack);
                    next(new Error('internal server error'));
                });
            }
            else
            {
                return next();
            }
        })
        .catch (function (err)
        {
            console.error('Handshake Failed : '+ namespace);
            console.error (err.stack);
            return next(new Error('Authentication error'));
        });
    });

    io.on('connection', function (socket)
    {
        config.room.getOne(socket.user.client)
        .then(function (room)
        {
            console.log (socket.user.name()+' connected to '+ namespace);
            return room.bindSocket(new RemoteSocket(socket));
        })
        .catch (function(err)
        {
            console.error (socket.user.name()+' load failed : '+socket.user.client.name + ' - '+namespace);
            if (err instanceof Error)
            {
                console.error (err.stack);
            }
            /** AJOUTER ENVOI D'ERREUR AU CLIENT **/
            socket.disconnect();
        });
    });
    console.log (namespace +' : remote server started');
    return io;
};

Server.addRoute ('/kill', function (req,res)
{
    var cookies = Util.parseCookies(req.headers.cookie);
    if (cookies.undefined) return server.error (412);
    User.getOne({cookie: cookies.tuituit}).then(function (user)
    {
        var user = this;
        if (this.connected)
        {
            user.kill().then(function()
            {
                res.writeHead(200);
                res.end(JSON.stringify({module: Modulator.home.name}));
            })
            .catch (function (err)
            {
                console.error(err.stack);
                res.error (500);
            });
        }
        else
        {
            res.writeHead(200);
            res.end(JSON.stringify({module: Modulator.home.name}));
        }
    })
    .catch(function ()
    {
        res.error (401);
    });
});