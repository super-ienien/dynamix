module.exports = {
    pathValue,
    rundown,
    makeDynamixId,
    parseDynamixId
};

function pathValue (path, obj)
{
    if (!obj || typeof obj !== 'object') return;
    if (typeof path !== 'string') return;
    path = path.split ('.');
    var pathLength = path.length;
    var value = obj;
    for (var i = 0, l = pathLength; i<l; i++)
    {
        value = value[path[i]];
        if (typeof value === 'function') value = value.apply(obj);
        if (typeof value !== 'object') return value;
    }
    return value !== obj ? value:undefined;
}

function rundown (steps, context, i = 0)
{
    let r, error;
    try
    {
        r = steps[i].call(context);
    }
    catch (e)
    {
        onError.call(context, e);
        r = e;
        error = true;
    }

    if (!error && i < steps.length-1)
    {
        if (r && typeof r === 'object' && typeof r.then === 'function')
        {
            r = r.then(function () {
                return rundown(steps, context, onError, i+1);
            }, function (e) {
                onError.call(context, e);
            });
        }
        else
        {
            r = rundown(steps, context, onError, i+1);
        }
    }

    if (i > 0) return r;
    else Promise.resolve(r);
}

function makeDynamixId (instance)
{
    return '00.' + instance.__static.name + '.' + instance._id;
}

function parseDynamixId (dynamixId)
{
    if (typeof dynamixId !== 'string') return false;
    let splitted = dynamixId.split('.');
    if (splitted.length !== 3) return false;
    return {
        machineId: splitted[0],
        type: splitted[1],
        id: splitted[2]
    };
}