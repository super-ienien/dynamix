"use strict";
module.exports = function remotedNormalizer (value)
{
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string') return value;
    throw new Error ('value is not a valid remoted external _id');
};
