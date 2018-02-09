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