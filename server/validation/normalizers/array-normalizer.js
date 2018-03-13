"use strict";
module.exports = function arrayNormalizer (value)
{
    if (value === null || typeof value === 'undefined') return null;
    if (Array.isArray(value)) return value.slice();
    if (typeof value[Symbol.iterator] === 'function') return Array.from(value);
    if (value) throw new Error ('Invalid array value');
    return null;
};