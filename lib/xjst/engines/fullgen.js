var xjst = require('../../xjst'),
    utils = xjst.utils;

function getPredicateValues(templates) {
  var vals = {};

  templates.forEach(function(t) {
    t[0].forEach(function(subMatch) {
      var p = subMatch[0],
          c = utils.stringify(subMatch[2]);

      vals[p] || (vals[p] = {});
      vals[p][c] = subMatch[2];
    });
  });

  Object.keys(vals).forEach(function(p) {
    vals[p] = Object.keys(vals[p]).map(function(key) {
      return vals[p][key];
    });
  });

  return vals;
};

module.exports = function engine(templates, predicateMap, options) {
  var predicatesValues = getPredicateValues(templates),
      merger = new utils.Merger(),
      merge = merger.merge.bind(merger),
      unique = new utils.Identifier();

  function addNode(node, memo) {
    if (node.state) {
      node.state = utils.join(node.state, memo, predicateMap, unique);
    } else {
      node.state = utils.join({}, memo, predicateMap, unique);
    }

    if (options.merge && node.switch) {
      node.longId = utils.sha1(utils.stringify(node.state));
    }

    return node;
  };


  function traverse(i, j, predicMemo) {
    var template = templates[i];

    // If we stepped out of templates - we're in unexpected place
    // throw exception
    if(!template) {
      return addNode(
        merge({ tag: 'unexpected', fn: true, stmt: ['throw', ['get', 'true']] }),
        predicMemo
      );
    };

    // If we stepped out of predicates - add template's body to tree
    var subMatch = template[0][j];
    if(!subMatch) return addNode(merge({ stmt: template[1] }), predicMemo);

    // Skip unreachable templates
    // template (p1 === c1 && p2 === c2)
    var known = template[0].slice(j + 1).some(function(s) {
      var predicate = s[0],
          predicateConst = s[2];

      return predicMemo[predicate] !== undefined &&
             predicMemo[predicate] != utils.stringify(predicateConst);
    });
    if (known) return traverse(i + 1, 0, predicMemo);

    var predicate = subMatch[0],
        predicateConst = subMatch[2];

    // If we already know value of this predicate
    if(predicMemo[predicate] !== undefined) {
      // And if current template's predicate value equals to known
      if(predicMemo[predicate] === utils.stringify(predicateConst)) {
        // Skip this predicate and go further
        return traverse(i, j + 1, predicMemo);
      } else {
        // Skip whole template as it's unreachable
        return traverse(i + 1, 0, predicMemo);
      }
    } else {
      // Create switch for current predicate and all known values of it
      var result = {};

      result.switch = subMatch[1];
      result.cases = predicatesValues[predicate].map(function(v) {
        return [v, traverse(i, j,
                            utils.cloneChanged(predicMemo, predicate,
                                               utils.stringify(v)))];
      });
      result.default = traverse(i, j, utils.cloneChanged(predicMemo,
                                                         predicate,
                                                         null));
      return addNode(merge(result), predicMemo);
    }
  };

  return traverse(0, 0, {});
};