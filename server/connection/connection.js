"use strict";

const EventEmitter = require ('events');

const externalConnection = new Symbol('externalConnection');

class Connection extends EventEmitter
{
    constructor (externalConnection)
    {
        super();
        this[externalConnection] = externalConnection;
        this.user = this[externalConnection].user;
    }

    close ()
    {
        return new Promise ((resolve, reject) =>
        {
            if (!this[externalConnection].connected) return resolve();
            this[externalConnection].emit ('remote-kill');
            let to = setTimeout(() =>
            {
                reject (new Error ("Disconnect timeout for kill user "+this.user+" of "+this.user+" : "+this[externalConnection].id));
            }, 3000);

            this.once ('disconnect', function ()
            {
                clearTimeout (to);
                resolve();
            });
            this[externalConnection].disconnect();
        });
    }
}