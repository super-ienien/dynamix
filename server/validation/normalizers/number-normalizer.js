"use strict";
module.exports = function numberNormalizer (value)
{
    switch (typeof value)
    {
        case 'undefined':
        case 'number':
            return value;
        default:
            value = parseFloat(value);
            if (isNaN(value)) throw new Error ('value is not a valid number');
            return value;
    }
};