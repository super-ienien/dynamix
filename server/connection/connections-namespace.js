"use strict";
const privates = require('../privates');
const ExternalConnection = require ('./external-connection');

class ConnectionsNamespace
{
    constructor (name, io, root, access)
    {
        this.name = name;
        this.io = io;
        this.root = root;
        this.connections = new Set();
        this.accessRules = buildNamespaceAccessRules(access);

        io.use(this.checkIncomingConnection.bind(this));
        io.on('connection', this.incomingConnection.bind(this));

        console.log (namespace +' : remote server started');
        return io;
    };

    checkIncomingConnection (socket, next)
    {
        let cookies = helpers.parseCookies(socket.request.headers.cookie);
        User.getOne({cookie: cookies.tuituit})
        .then((user) =>
        {
            socket.user = user;
            if (!this.checkUserAccess(user))
            {
                console.log (user.name + ' is not authorized to access '+this.name);
                return next(new Error('Not authorized'));
            }
            return next();
        })
        .catch (function (err)
        {
            console.error('Handshake Failed : '+ namespace);
            console.error (err);
            return next(new Error('Authentication error'));
        });
    }

    checkUserAccess (user)
    {
        rules:
        for (let i = 0, l = this.accessRules.length; i < l; i++)
        {
            let rule = this.accessRules[i];
            if (rule.domain)
            {
                for (let i = 0; i<rule.domains.length; i++)
                {
                    if (!user.$domains.has(rule.domains[i])) continue rules
                }
            }
            else if (rule.domains)
            {
                if (!user[privates.domains].has(rules)) continue rules;
            }
            if (rule.role)
            {
                if (!user[privates.roles].has(rule.role)) continue rules;
            }
            else if (rule.roles)
            {
                for (let i = 0; i<rule.roles.length; i++)
                {
                    if (!user[privates.roles].has(rule.roles[i])) continue rules;
                }
            }
            return true;
        }
        return false;
    }

    incomingConnection(socket)
    {
        console.log (socket.user.name+' connected to '+ this.name);
        new ExternalConnection (socket, this.root);
    }
}

function buildNamespaceAccessRules (access)
{
    if (!access) return [{role:'everyone'}];
    let rules = [];

    if (!Array.isArray(access)) access = [access];

    for (let i = 0; i<access.length;i++)
    {
        let val = access[i];
        if (typeof rule !== 'string') throw new Error ('Invalid namespace access rule');
        let rule = {};
        let domains = [];
        let roles = val.split('&').map((role) => role.trim()).filter((role) =>
        {
            if (role.startsWith('$'))
            {
                domains.push(role);
                return false;
            }
            return !!role;
        });

        if (domains.length === 1) rule.domain = domains[0];
        else if (domains.length > 1) rule.domains = domains;
        if (roles.length === 1) rule.role = roles[0];
        else if (roles.length > 1) rule.roles = roles;
        rules.push(rule);
    }
    return rules;
}