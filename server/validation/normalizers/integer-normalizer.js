"use strict";
module.exports = function integerNormalizer (value)
{
    switch (typeof value)
    {
        case 'undefined':
            return value;
        case 'number':
            return Math.trunc(value);
        default:
            value = parseInt(value);
            if (isNaN(value)) throw new Error ('value is not a valid number');
            return value;
    }
};