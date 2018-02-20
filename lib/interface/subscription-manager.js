const cache = require ('../dynamix-cache');

module.exports = {
    subscribe
};

function subscribe (root, tree)
{
    let instance = cache.get(root);
    if (!instance) return;

    instance.$meta.subscribe(tree);
}