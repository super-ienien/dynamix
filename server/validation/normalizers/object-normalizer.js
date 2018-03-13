"use strict";
_ = require('lodash');

module.exports = function objectNormalizer (value)
{
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'object') return _.cloneDeep(value);
    throw new Error ('value is not an object');
};
