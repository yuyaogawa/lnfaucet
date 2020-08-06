const express = require('express');
const router = express.Router();
const sqlite3    = require('sqlite3');
const request = require('request');
const moment = require('moment');
//moment.locale('ja');

const path = require('path');
const multer = require('multer');
const fs = require('fs');

const sparko = 'YOUR-SPARKO-URL';
const xAccessKey = 'YOUR-SPARKO-X-ACCESS-KEY';
const CHARGE = 'YOUR-LIGHTNING-CHARGE-URL';

const secret = 'YOUR-RECAPTCHA-SECRET';
const reCAPTCHA_URL = 'https://www.google.com/recaptcha/api/siteverify';

const PRICE = 2000; //satoshi
let payment_preimage = '';
const PAYMENT_INTERVAL = 1440;//Payee has to wait 1440minutes
let time_diff = 3;

// eslint-disable-next-line no-undef
process.on('uncaughtException', function(err) {
    console.log(err);
});
router.post('/payinvoice', function(req, res, next) {
    const result = {status: 'generic'};
    let count = 0;
    const invoice = req.body.invoice;
    const token = req.body.token;
    console.log('invoce: ' + invoice);
    if(token != ''){
        const options = {
            url: reCAPTCHA_URL ,
            form: {'secret': secret,'response' : token,},
        };
        request.post(options, function (error, response, body) {
            const recap = JSON.parse(response.body);
            console.log(recap.score);
            if (!error && response.statusCode == 200 && recap.success && recap.score >= 0.9) {
                console.log('response: ' + body);
                const data = JSON.parse(body);
                if(data.success == true){
                    const decodepay_option = {
                        url: sparko,
                        method: 'POST',
                        headers: {
                            'X-Access': xAccessKey,
                        },
                        json: {
                            'method': 'decodepay',
                            'params': [invoice]
                        },
                    };
                    request.post(decodepay_option, function (error, response, body) {
                        const decodepay = body.payee;
                        const payee = body.payee;
                        const msatoshi = body.msatoshi;
                        if(decodepay === undefined){
                            result.status = 'bad-invoice';
                            res.send(result);
                        }else{
                            console.log(payee + ' ' + msatoshi);
                            //Check the payee if he recieved payment within 24hours
                            const db = new sqlite3.Database('lnfaucet.db');
                            db.serialize(function() {
                                const query_count = 'select count(*) as count from invoice where created_at > datetime("now", "localtime", "-1 days")';
                                db.get(query_count, function(err, rows) {
                                    if(err) throw err;
                                    count = rows.count;
                                    console.log(count);
                                });
                                // 請求者が前回いつ支払いを受けたかをＤＢへ問い合わせる
                                const query = 'SELECT case when IFNULL(MAX(created_at),"") = "" then 0 else MAX(created_at) end latestpayment FROM invoice WHERE id = "' + payee + '"';
                                db.get(query, function(err, rows) {
                                    if(err) throw err;
                                    if(rows.latestpayment != 0){
                                        console.log('latestpayment: ' + rows.latestpayment);
                                        console.log('now: ' + moment());
                                        time_diff = moment().diff(rows.latestpayment, 'minutes');
                                    }else{
                                        time_diff = 1440;
                                        console.log('default: ' + time_diff);
                                    }
                                    console.log('time_diff: ' + time_diff);
                                    console.log('PAYMENT_INTERVAL: ' + PAYMENT_INTERVAL + '  time_diff: ' + time_diff);
                                    if(msatoshi <= 400000 && PAYMENT_INTERVAL <= time_diff && count <= 100){
                                        const pay_option = {
                                            url: sparko,
                                            method: 'POST',
                                            headers: {
                                                'X-Access': xAccessKey,
                                            },
                                            json: {'method': 'pay',
                                                'params': [invoice]
                                            },
                                        };
                                        request.post(pay_option, function (error, response, body) {
                                            console.log(body);
                                            payment_preimage = body.payment_preimage;
                                            if(payment_preimage !== undefined){
                                                console.log('payment_preimage: ' + payment_preimage);
                                                result.status = 'ok';
                                                // Store the payment info
                                                const db = new sqlite3.Database('lnfaucet.db');
                                                db.serialize(function() {
                                                    const stmt = db.prepare('INSERT INTO invoice VALUES (?,?,?,?)');
                                                    stmt.run(payee, payment_preimage, invoice, moment().format('YYYY-MM-DD HH:mm:ss'));
                                                    stmt.finalize();
                                                });
                                                db.close();
                                            }else{
                                                result.status = 'generic';
                                            }
                                            //res.header('Content-Type', 'application/json; charset=utf-8');
                                            res.send(result);
                                        });
                                    }else{
                                        if(PAYMENT_INTERVAL > time_diff){
                                            result.status = 'already-claimed';
                                        }else if(msatoshi > 400000){
                                            result.status = 'excessive-payout';
                                        }else if(count >= 100){
                                            result.status = 'too-much-payout';
                                        }else{
                                            result.status = '???';
                                        }
                                        console.log('param: ' + result.status);
                                        res.send(result);
                                    }
                                });
                            });
                            db.close();
                        }
                    });
                }else{
                    console.log('You might be Bot!');
                    res.send(result);
                }
            }else{
                console.log('error: '+ response);
                res.send(result);
            }
        });
    }else{
        console.log('token for reCAPTCHA is not set...');
        res.send(result);
    }
});

router.get('/updateNodes', function(req, res) {
    let history;
    const db = new sqlite3.Database('lnfaucet.db');
    db.serialize(function() {
        const query = 'select count(id) as count, id, created_at from invoice group by id ORDER BY count DESC;';
        db.all(query, function(err, rows) {
            if(err) throw err;
            history = rows;
            rows.forEach(function (row) {
                //console.log(row.id);
                let node;
                const listnodes_option = {
                    url: sparko,
                    method: 'POST',
                    headers: {
                        'X-Access': xAccessKey,
                    },
                    json: {
                        'method': 'listnodes',
                        'params': [row.id]
                    },
                };
                request.post(listnodes_option, function (error, response, body) {
                    node = body.nodes;
                    if(node.length){
                        //console.log(node);
                        node = node[0];
                        db.serialize(function() {
                            const stmt = db.prepare('REPLACE INTO node VALUES (?,?,?,?,?,?,?)');
                            stmt.run(node.nodeid, node.alias, node.color, node.last_timestamp, null, moment().format('YYYY-MM-DD HH:mm:ss'), null);
                            stmt.finalize();
                        });
                    }
                    //db.close();
                });
            });
            res.header('Content-Type', 'application/json; charset=utf-8');
            res.send(history);
        });
    });
});

// ファイルアップロードは以下を参考
// https://stackoverflow.com/questions/15772394/how-to-upload-display-and-save-images-using-node-js-and-express
const upload = multer({
    dest: './temp'
    // you might also want to set some limits: https://github.com/expressjs/multer#limits
});
const handleError = (err, res) => {
    res
        .status(500)
        .contentType('text/plain')
        .end('Oops! Something went wrong!');
};
router.post('/getinvoice', upload.single('file'), function(req, res, next) {
    //画像ファイルの処理
    const content_id = req.body.content_id;
    let file_name = null;
    if(req.file !== undefined){
        console.log('Got image!!!!');
        file_name = content_id + '_' + req.file.originalname;
        const tempPath = req.file.path;
        const targetPath = path.join('./public/images/' + file_name);
        fs.rename(tempPath, targetPath, err => {
            if (err) return handleError(err, res);
        });
    }else{
        console.log('No image!!!!');
    }
    const message = (req.body.message == '')? null : req.body.message;
    const link = (req.body.link == '')? null : req.body.link;
    const title = (req.body.title == '')? null : req.body.title;
    const category = (req.body.category == '')? null : req.body.category;
    const pubkey = (req.body.pubkey == '')? null : req.body.pubkey;
    const user_id = null;
    const created_at = moment().format('YYYY-MM-DD HH:mm:ss');
    const options = {
        rejectUnauthorized: false,
        url: CHARGE + '/invoice' ,
        form:{msatoshi:PRICE * 1000},
    };
    request.post(options, function (error, response, body) {
        console.log('Requesting invoice...');
        if (!error && response.statusCode == 201) {
            const data = JSON.parse(body);
            const invoice_id = data['id'];
            const invoice = data['payreq'];
            const db = new sqlite3.Database('lnfaucet.db');
            db.serialize(function() {
                const stmt = db.prepare('INSERT INTO content VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
                stmt.run(content_id, invoice_id, user_id, title, message, category, file_name, link, pubkey, 0, 0, created_at, created_at);
                stmt.finalize();
            });
            db.close();
            res.send(invoice);
        }else{
            console.log('error: '+ response.statusCode);
        }
    });
});
router.get('/checkpayment', function(req, res, next) {
    const content_id = req.query.content_id;
    console.log('content_id:' + content_id);
    const db = new sqlite3.Database('lnfaucet.db');
    db.serialize(function() {
        const query = 'SELECT invoice_id FROM content WHERE content_id = "' + content_id + '"';
        db.each(query, function(err, rows) {
            const options = {
                rejectUnauthorized: false,
                url: CHARGE + '/invoice/' + rows.invoice_id,
            };
            request.get(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    const data = JSON.parse(body);
                    console.log(data['status']);
                    if(data['status'] == 'paid'){
                        const db = new sqlite3.Database('lnfaucet.db');
                        db.serialize(function() {
                            db.run('UPDATE content SET paid = ? WHERE content_id = ?', 1, content_id);
                            console.log('Awesome!');
                        });
                        db.close();
                    }
                }else{
                    console.log('error: '+ error);
                }
                res.send(body);
            });
        });
    });
    db.close();
});
module.exports = router;
