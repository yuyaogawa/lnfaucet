const express = require('express');
const router = express.Router();
const sqlite3    = require('sqlite3');

// eslint-disable-next-line no-undef
process.on('uncaughtException', function(err) {
    console.log(err);
});

router.get('/', function(req, res, next) {
    let history;
    let content;
    const db = new sqlite3.Database('lnfaucet.db');
    db.serialize(function() {
        const query_ad = 'select * from content where paid =1 order by created_at desc limit 1';
        db.get(query_ad, function(err, rows) {
            if(err) throw err;
            content = rows;
        });
        const query_history = 'select count(id) as count, id, IFNULL(node.alias, substr(id,0,30)) as alias, invoice.created_at from invoice ' + 
                    'left outer join node on invoice.id == node.nodeid ' +
                    'group by id ORDER BY invoice.created_at DESC limit 20;';
        db.all(query_history, function(err, rows) {
            console.log(query_history);
            console.log(rows);
            if(err) throw err;
            history = rows;
            const data = {
                'history': history,
                'content': content,
            };
            res.render('index', {data: data});
            db.close();
        });
    });
});

module.exports = router;
