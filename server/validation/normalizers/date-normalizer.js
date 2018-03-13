"use strict";
module.exports = function dateNormalizer (value)
{
    if (value === null || typeof value === 'undefined') return null;
    if (!(value instanceof Date))
    {
        if (Array.isArray(value)) value = new Date(...value);
        else if (value === 'now') value = Date.now();
        else value = new Date(value);
    }

    if (isNaN(value.getTime())) throw new Error ('value is not a valid date');

    return value;
};