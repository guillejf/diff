const express = require('express');
const app = express();
const port = 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mysql = require('mysql');
let connection;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/connect', (req, res) => {
  res.sendFile(__dirname + '/form.html');
});

app.post('/connect', (req, res) => {
  if (!req.body?.port) {
    return res.json({ error: true, msg: 'puerto no ingresado' });
  }
  connection = mysql.createConnection({
    host: req.body.host,
    user: req.body.user,
    password: req.body.password,
    database: req.body.database,
    port: req.body.port,
    multipleStatements: true,
  });
  connection.connect();

  res.redirect('/');
});

app.get('/snapshot', (req, res) => {
  connection.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'db' AND RIGHT (table_name,5) != '_copy';`, function (error, tables, fields) {
    if (error) {
      return res.json({ error: true, ...error });
      //console.log(error);
    } else {
      let toRes = [];
      let countPromises = 0;
      tables.forEach((table, i) => {
        /* if (table.table_name.slice(-5) == '_copy') {
          connection.query(`DROP TABLE IF EXISTS ${table.table_name};`, (error, tables, fields) => countPromises++);
        } else  */ {
          connection.query(`DROP TABLE IF EXISTS ${table.table_name}_copy;CREATE TABLE ${table.table_name}_copy SELECT * FROM ${table.table_name};`, function (error, results, fields) {
            countPromises++;
            if (error) {
              return res.json({ error: true, ...error });
            } else {
              toRes.push(table.table_name);
              //console.log('flushed ' + i + ' ' + table.table_name);
              if (countPromises == tables.length) {
                return res.json({ total: toRes.length, tables: toRes });
              }
            }
          });
        }
      });
    }
  });
});

app.get('/diff', (req, res) => {
  connection.query(`SELECT table_schema,table_name,update_time FROM information_schema.tables WHERE table_schema = 'db' AND RIGHT (table_name,5) != '_copy';`, function (error, tables, fields) {
    if (error) {
      return res.json({ error: true, ...error });
    } else {
      //console.log(tables);
      let toRes = [];
      let countPromises = 0;
      tables.forEach((table, i) => {
        connection.query(`SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table.table_name}' AND TABLE_SCHEMA = 'db';`, function (error, result, fields) {
          if (error) {
            return res.json({ error: true, ...error });
          } else {
            let str = '',
              str1 = '',
              str2 = '';
            for (let i = 0; i < result.length; i++) {
              const item = result[i].COLUMN_NAME;
              str += item + ', ';
              str1 += 't1.' + item + ', ';
              str2 += 't2.' + item + ', ';
            }

            str = str.slice(0, -2);
            str1 = str1.slice(0, -2);
            str2 = str2.slice(0, -2);

            connection.query(
              `SELECT ${str} FROM ( SELECT ${str1} FROM ${table.table_name} as t1 UNION ALL SELECT ${str2} FROM ${table.table_name}_copy as t2 ) t GROUP BY ${str} HAVING COUNT(*) = 1`,
              function (error, results, fields) {
                countPromises++;
                if (error) {
                  return res.json({ error: true, ...error });
                } else {
                  if (results?.length) {
                    toRes.push({ [table.table_name]: results });
                    console.table(results);
                    console.log(
                      `SELECT ${str} FROM ( SELECT ${str1} FROM ${table.table_name} as t1 UNION ALL SELECT ${str2} FROM ${table.table_name}_copy as t2 ) t GROUP BY ${str} HAVING COUNT(*) = 1`
                    );
                  }
                  //toRes.push(table.table_name);
                  //console.log('cloned ' + i + ' ' + table.table_name);
                  //console.log(results);
                  if (countPromises == tables.length) {
                    return res.json(toRes);
                  }
                }
              }
            );
          }
        });
      });
    }
  });
});

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}`);
});

// connection.end();
