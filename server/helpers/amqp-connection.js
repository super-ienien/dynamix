'use strict';

const amqp = require('amqplib');
const EventEmitter = require ('events');
const helpers = require ('./util');
const Promise = require ('bluebird');

class AMQPConnection extends EventEmitter
{
    constructor(opts)
    {
        super(opts);
        this.opts = Object.assign({
            host: '127.0.0.1'
        ,   retryDelay: 5000
        ,   maxRetry: Infinity
        }, opts);
        this.retryCount = 0;
        this._connectionListeners = {
            close: this._onConnectionClose.bind(this)
        ,   error: this._onConnectionError.bind(this)
        };

        this._channelListeners = {
            close: this._onChannelClose.bind(this)
        ,   return: this._onChannelReturn.bind(this)
        ,   drain: this._onChannelDrain.bind(this)
        ,   error: this._onChannelError.bind(this)
        }
    }

    get connected ()
    {
        return !!this.channel;
    }

    get connecting ()
    {
        return !!this._connectingPromise;
    }

    connect ()
    {
        if (this.connected || this._connecting) return;
        return this._connect();
    }

    close ()
    {
        if (!this.connected) return Promise.resolve();
        this.closing = true;
        return this.connection.close()
        .catch((e)=>
        {
            console.error (e);
        })
        .finally(()=>
        {
            this.closing = false;
        })
    }

    _connect ()
    {
        if (this.closing) return;
        console.log ('amqp connecting');
        var auth = this.opts.user ? (this.opts.user+(this.opts.password ? ":"+this.opts.password:'')+'@'):'';
        this._connectingPromise = amqp.connect('amqp://'+auth + this.opts.host+':'+this.opts.port+(this.opts.query ? '?'+this.opts.query:''))
        .then((conn) => {
            console.log ('amqp connected');
            this.connection = conn;
            helpers.addListenersTo(this.connection, this._connectionListeners);
            return conn.createChannel();
        })
        .then((ch) => {
            console.log ('amqp channel opened');
            this.channel = ch;
            helpers.addListenersTo(this.channel, this._channelListeners);
            this.retryCount = 0;
            this._connectingPromise = null;
            this.emit('connected');
        })
        .catch((e) => {
            console.error (e.message);
            this.emit('connection-error', e);
            return this._retry();
        });
        this.emit('connecting');
        return this._connectingPromise;
    }

    _retry()
    {
        if (this.opts.maxRetry < Infinity && this.opts.maxRetry < this.retryCount)
        {
            this._connectingPromise = null;
            throw new Error ("Connection aborted. Max retry attempt reached");
        }
        else
        {
            this.retryCount++;
            return Promise.delay(this.opts.retryDelay)
            .then(() => {
                this._connect();
            });
        }
    }

    _onConnectionClose(e)
    {
        console.log ('connection close');
        helpers.removeListenersFrom(this.connection, this._connectionListeners);
        if (this.channel) helpers.removeListenersFrom(this.channel, this._channelListeners);
        this.connection = null;
        this.channel = null;
        this.emit('disconnected', e);
        if (!this.closing) this._retry();
    }

    _onConnectionError(e)
    {
        console.error (e);
    }

    _onChannelClose()
    {
        console.log ('channel close');
        helpers.removeListenersFrom(this.channel, this._channelListeners);
        this.channel = null;
        if (this.connection) this.connection.close();
    }

    _onChannelError(e)
    {
        console.error (e);
    }

    _onChannelDrain(...args)
    {
        this.emit('drain', ...args);
    }

    _onChannelReturn(...args)
    {
        this.emit('return', ...args);
    }
}

module.exports = AMQPConnection;