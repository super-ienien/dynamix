const EventEmitter = require("events");

exports = module.exports = BaseObject;

const childsMap = new Map();
const parentsMap = new Map();

class BaseObject extends EventEmitter
{
    constructor()
    {
        super();
        events.EventEmitter.call(this);
        this.setMaxListeners(200);
        this.destroyed = false;
    }

    set parent (parent)
    {
        if (!(parent instanceof BaseObject)) return;
        let childs = childsMap.get(parent);
        if (!childs)
        {
            childs = new Set();
            childsMap.set(parent, childs);
        }
        childs.add(this);
        parentsMap.set(this, parent);
    }

    get parent ()
    {
        return parentsMap.get(this);
    }

    addListeners (listeners)
    {
        for (let i in listeners)
        {
            this.addListener(i,listeners[i]);
        }
        return this;
    }

    removeListeners (listeners)
    {
        for (let i in listeners)
        {
            this.removeListener(i,listeners[i]);
        }
        return this;
    }

    destroy ()
    {
        if (this.destroyed) return;
        this.destroyed = true;
        let childs = childsMap.get(this);
        if (childs)
        {
            childsMap.delete(this);
            childs.forEach ((child) => {
                child.destroy();
            });
        }
        this.removeAllListeners();
        parentsMap.delete(this);
        return true;
    }
}