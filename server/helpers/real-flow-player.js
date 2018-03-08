const EventEmitter = require('events');

class RealFlowPlayer extends EventEmitter
{
    /**
     * @constructs
     * @param {object} opts
     */
    constructor(opts = {})
    {
        super();
        this.stack = [];
        this.pending = true;
        this._sendNextItem = this._sendNextItem.bind(this);
        this.delta = 0;
        this._lastFlow = Date.now();
        this._minTime = 0;
        // doit être redéfini dans l'instance
        this.onFlow = new Function();
        this.timestampPropertyName = opts.timestampPropertyName ? opts.timestampPropertyName:'created_timestamp';
        this.sortItems = this.sortItems.bind(this);
    }

    /**
     * Charge les données de messages à traiter
     * et lance la boucle de traitement
     * @param {array} items
     */
    payload(items)
    {
        this.stack.push(...items);
        this.stack.sort(this.sortItems);
        if (this.stack.length>50) console.log ('WARNING REAL FLOW PLAYER STACK INCREASE '+this.stack.length);
        this._flow();
    }

    /**
     *
     */
    stop()
    {
        clearTimeout(this._flowTimeout);
        this._flowTimeout = null;
        this.stack.length = 0;
        this.delta = 0;
        this._minTime = 0;
        this.pending = true;
        this._nextItem = null;
    }

    /**
     * émet l'événement flow
     */
    _flow()
    {
        if (!this.pending) return;

        let nextItem;
        while (nextItem = this.stack.shift())
        {
            if (nextItem[this.timestampPropertyName] <= this._minTime)
            {
                this.onFlow(nextItem);
                this.emit('flow', nextItem);
            }
            else break;
        }

        if (!nextItem)
        {
            this.pending = true;
            return;
        }

        let timeout, targetDelta, currentDelta, lastItem = this._nextItem;

        this.pending = false;
        this._nextItem = nextItem;

        if (!lastItem)
        {
            timeout = 0;
        }
        else
        {
            targetDelta = this._nextItem[this.timestampPropertyName] - lastItem[this.timestampPropertyName];
            if (targetDelta < 0) targetDelta = 0;
            currentDelta = Date.now()-this._lastFlow;
            timeout = targetDelta-currentDelta;
            if (timeout < 0) timeout = 0;
        }
        if (timeout)
        {
            this._flowTimeout = setTimeout(this._sendNextItem, timeout);
        }
        else
        {
            this._sendNextItem();
        }
        this._minTime = this._nextItem[this.timestampPropertyName];
    }

    /**
     *
     */
    _sendNextItem()
    {
        this._flowTimeout = null;
        this.emit('flow', this._nextItem);
        this.onFlow(this._nextItem);
        this.pending = true;
        this._lastFlow = Date.now();
        this._flow();
    }

    /**
     * Callback de tri des messages
     * @param {Object} a
     * @param {Object} b
     * @return {Number}
     */
    sortItems(a, b)
    {
        if (a[this.timestampPropertyName] > b[this.timestampPropertyName]) return 1;
        if (a[this.timestampPropertyName] < b[this.timestampPropertyName]) return -1;
        return 0;
    }
}

module.exports = RealFlowPlayer;