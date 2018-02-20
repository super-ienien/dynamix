class DynamixMeta
{
    constructor (context)
    {
        this.context = context;
        this.static = context.__static;
        this.subscriptions = {};
        this.scheduledSubscriptionsUpdate = null;
    }

    subscribe (subscriber, graph, circularRefs = new Set())
    {
        if (!graph || typeof graph !== 'object')
        {
            if (graph === 'all')
            {
                graph = this.static.graph.all;
            }
            else graph = this.static.graph.default;
        }

        for (let i in graph)
        {
            let field = this.static.schema[i];
            if (!field || field.private) continue;

            if (!this.subscriptions[i]) this.subscriptions[i] = new Set([subscriber]);
            else this.subscriptions[i].add(subscriber);

            if (!graph[i]) continue;

            if (field.isRef)
            {
                if (field.isArray)
                {
                    let arr = this.context[i];
                    ret[i] = [];
                    for (let j = 0, l = arr.length; j<l; j++)
                    {
                        let val = arr[j];
                        if (!val || circularRefs.has(val)) continue;
                        circularRefs.add(val);
                        val.$meta.subscribe(subscriber, graph[i], circularRefs);
                    }
                }
                else
                {
                    let val = this.context[i];
                    if (!val || circularRefs.has(val)) continue;
                    circularRefs.add(val);
                    val.$meta.subscribe(subscriber, graph[i], circularRefs);
                }
            }
        }
    }

    unsubscribe (subscriber, graph, circularRefs = new Set())
    {
        if (!graph || typeof graph !== 'object')
        {
            if (graph === 'all')
            {
                graph = this.static.graph.all;
            }
            else graph = this.static.graph.default;
        }

        for (let i in graph)
        {
            let field = this.static.schema[i];
            if (!field || field.private) continue;

            if (!this.subscriptions[i]) continue;
            else
            {
                this.subscriptions[i].delete(subscriber);
                if (this.subscriptions[i].size === 0) delete this.subscriptions[i];
            }

            if (!graph[i]) continue;

            if (field.isRef)
            {
                if (field.isArray)
                {
                    let arr = this.context[i];
                    ret[i] = [];
                    for (let j = 0, l = arr.length; j<l; j++)
                    {
                        let val = arr[j];
                        if (!val || circularRefs.has(val)) continue;
                        circularRefs.add(val);
                        val.$meta.subscribe(subscriber, graph[i], circularRefs);
                    }
                }
                else
                {
                    let val = this.context[i];
                    if (!val || circularRefs.has(val)) continue;
                    circularRefs.add(val);
                    val.$meta.subscribe(subscriber, graph[i], circularRefs);
                }
            }
        }
    }

    markModified(fields)
    {
        if (!Array.isArray(fields)) fields = [fields];

        for (let i = 0, l = fields.length; i<l; i++)
        {
            let field = fields[i];
            if (this.subscriptions[field]) this.pendingModifications.add(field);
        }
        if (!this.pendingModifications.size || this._shceduledSubscriptionsUpdate) return;

        this.scheduledSubscriptionsUpdate = setImmediate(this.sendSubscriptionsUpdate);
    }

    sendSubscriptionsUpdate = () =>
    {
         let graphs = new Map();
         for (let field of this.pendingModifications)
         {
             field.
         }

         this.pendingModifications.clear();
    }
}