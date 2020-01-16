var fs = require('fs'); 
var math = require('mathjs');

var filepath = process.argv[2];
var file = fs.readFileSync(filepath, 'utf-8');

var rows = file.split("\n");

var tpc_array = new Array();
var mpc_array = new Array();
var tpc_acc = 0;

for (var i = 0; i < rows.length && rows[i].length > 0; i++) {
    var datas = rows[i].split(/\s+/);
    var type = datas[4];
    if (type == "updateBalance") {
        tpc_acc += parseInt(datas[6]);
    } else if (type == "updateMPC") {
        mpc_gas = parseInt(datas[6]);
        mpc_array.push(mpc_gas);
        tpc_array.push(tpc_acc);
        console.log("tpc: ", tpc_acc, " , mpc: ", mpc_gas);
        tpc_acc = 0;
    }
}

var tpc_sum = 0;
var tpc_avg = 0;
var mpc_sum = 0;
var mpc_avg = 0;

for (var i = 0; i < tpc_array.length; i++) {
    tpc_sum += tpc_array[i];
    mpc_sum += mpc_array[i];
}
tpc_avg = tpc_sum / 100;
mpc_avg = mpc_sum / 100;


tpc_std = 0;
mpc_std = 0;
for (var i = 0; i < tpc_array.length; i++) {
    tpc_std += 0.01 * ((tpc_array[i] / 10.0 - tpc_avg) * (tpc_array[i] / 10.0 - tpc_avg)) * 10;
    mpc_std += 0.01 * ((mpc_array[i] / 10.0 - mpc_avg) * (mpc_array[i] / 10.0 - mpc_avg)) * 10;
}

console.log("tpc_std_sum = ", tpc_std);
console.log("mpc_std_sum = ", mpc_std);
console.log("tpc_std = ", math.sqrt(tpc_std));
console.log("mpc_std = ", math.sqrt(mpc_std));
