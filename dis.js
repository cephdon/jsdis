//var test = "\u00c0\u000c\u0080\u0030\u0080\u0040\u0081\u00e0\u000b\u0010\u0004\u0001\u0000\u0003\u0008\u0040\u0000\u0000\u000c\u0005\u0011\u0001\u0028\u0004\u000a\u0028\u0004\u000c\u001b\u0005\u0011\u0002\u0024\u0029\u0005\u0004\u0024\u0020\u0027\u000d\u0020\u0024\u0010\u0009\u0048\u0000\u0024\u000c\u0005\u0011\u0001\u0024\u0004\u000a\u0024\u0004\u000c\u001b\u0000\u0010\u0001\u00f0\u0001\u0028\u0000\u0002\u0028\u0002\u0000\u0080\u0003\u0030\u0002\u0000\u00c0\u0034\u0000\u0024\u0053\u0079\u0073\u0032\u0004\u0068\u0069\u0000\u0052\u0065\u0063\u0000\u0000\u0003\u0042\u0044\u00b3\u0054\u0069\u006e\u0069\u0074\u0000\u0001\u0001\u00ac\u0084\u0090\u0033\u0070\u0072\u0069\u006e\u0074\u0000\u0000\u002f\u0075\u0073\u0072\u002f\u006d\u0061\u0078\u002f\u0074\u0065\u0073\u0074\u002f\u0072\u0065\u0063\u002e\u0062\u0000";
var test = "\u00c0\u000c\u0080\u0030\u0080\u0040\u0000\u0004\u000c\u0002\u0001\u0000\u0001\u0008\u0040\u0000\u0000\u0008\u002d\u0011\u002a\u0028\u003a\u0011\u0001\u0028\u000c\u001b\u0000\u000c\u0001\u00e0\u0001\u0030\u0002\u0000\u00c0\u0034\u0000\u0024\u0053\u0079\u0073\u0000\u0052\u0065\u0063\u0000\u0000\u0001\u0042\u0044\u00b3\u0054\u0069\u006e\u0069\u0074\u0000\u0001\u0000\u0000\u002f\u0072\u0065\u0063\u0032\u002e\u0062\u0000";

function showstuff(s){
	var r = "", i;

	if(typeof s == "object"){
		if(s instanceof Array){
			for(i = 0; i < s.length; i++)
				r += showstuff(s[i]) + ", ";
			return "[" + r + "]";
		}
		for(i in s)
			r += i + ": " + showstuff(s[i]) + ", ";
		return "{" + r + "}";
	}
	return s;
}

function replicate(n, f){
	var r = [];

	while(n-- > 0)
		r.push(f());
	return r;
}

var dis = function(){
	function read(s){
		var i = 0;

		function byte(){
			return s.charCodeAt(i++);
		}

		function chunk(l){
			i += l;
			return s.substr(i - l, l);
		}

		function comp(i, n){
			return i < 1 << n-1? i : i - (1 << n);
		}

		function bigend32(){
			return byte() << 24 | byte() << 16 | byte() << 8 | byte();
		}

		function utf8(){
			var x = i;

			for(; s.charAt(i) != "\u0000"; i++);
			return s.substr(x, i++ - x);
		}

		// TODO: ieee754

		function header(){
			var r = {};
	
			r.magic = op();
			if(r.magic == 923426)
				r.signature = chunk(op());
			r.runtime_flag = op();
			r.stack_extent = op();
			r.code_size = op();
			r.data_size = op();
			r.type_size = op();
			r.link_size = op();
			r.entry_pc = op();
			r.entry_type = op();
			return r;
		}

		// operand = [] | [immed] | [ind, isfp] | [ind1, ind2, isfp]
		// [code, mid_operand, left_operand, right_operand]
		function instruction(){
			var opcode = byte(), addrmode = byte(), amm, amsd, r, x;

			r = [opcode];
			amm = addrmode >> 6;
			amsd = [addrmode >> 3 & 7, addrmode & 7];
			r.push(
				amm == 0? [] :
				amm == 1? [op()] :
				[op(), !(amm & 1)]);
			for(x = 0; x < 2; x++)
				r.push(
					amsd[x] == 3 || amsd[x] > 5? [] :
					amsd[x] == 2? [op()] :
					amsd[x] >> 1? [op(), op(), amsd[x] & 1] :
					[op(), !!(amsd[x] & 1)]);
			return r;
		}

		function type(){
			var num = op(), size = op(), ptrs = op();

			return { desc_number: num, size: size, number_ptrs: ptrs,
				map: Array.prototype.map.call(chunk(ptrs), function(c){ return c.charCodeAt(0); }) };
		}

		function datum(){
			var code = byte(), count, offset, s, t;

			count = code & 15? code & 15 : op();
			offset = op();
			if(code >> 4 == 7)
				return { type: 7, data: count };
			switch(code >> 4){
				case 1:
					return { type: "bytes", offset: offset, data: replicate(count, byte) };
				case 2:
					return { type: "words", offset: offset, data: replicate(count, bigend32) };
				case 3:
					// should I encode this into JS' UTF-16?
					return { type: "string", offset: offset, data: chunk(count) };
				case 4:
					return { type: "ieee754", offset: offset, data: replicate(count, ieee754) };
				case 5:
					return { type: "array", offset: offset, data: replicate(count, function(){
						return replicate(2, bigend32);
					}) };
				case 6:
					/* wtf */
					return { type: "index" };
				case 7:
					return { type: "pop", offset: offset, count: count };
				case 8:
					return { type: "longs", offset: offset, data: replicate(count, function(){
						return replicate(4, byte);
					}) };
			}
		}

		function link(){
			return { pc: op(), type: op(), sig: bigend32(), name: utf8() };
		}

		function all(){
			var code, types, data = [], name, links, head = header(), x;

			code = replicate(head.code_size, instruction);
			types = replicate(head.type_size, type);
			while(byte()){
				i--;
				data.push(datum());
			}
			name = utf8();
			links = replicate(head.link_size, link);
			// TODO: imports?
			return { name: name, header: head, code: code, types: types, data: data, links: links };
		}
	
		function op(){
			var b = byte();

			if((b & 128) == 0)
				return comp(b & 127, 7);
			if((b & (128 | 64)) == 128)
				return comp((b & 63) << 8 | byte(), 14);
			return comp((b & 63) << 24 | byte() << 16 | byte() << 8 | byte(), 30);
		}

		return all();
	}

	function quotes(s){
		// TODO: ..
		return s.toSource();
	}

	function compile(source){
		function operand(ins, i){
			var n = ins[i + 1];
			switch(n.length){
				case 0:
					if(i == 0)
						return operand(ins, 2);
					throw "expected operand";
				case 1:
					return "" + n[0];
				case 2:
					return n[1]? "fp[" + n[0] + "]" : "mp$" + n[0];
				case 3:
					return (n[2]? "fp[" + n[0] + "]" : "mp$" + n[0]) + "[" + n[1] + "]";
			}
		}

		var code = [], x, y, m, ins;
		
		for(x = 0; x < source.data.length; x++)
			switch((ins = source.data[x]).type){
				case "bytes":
				case "words":
					m = ins.type == "words"? 4 : 1;
					for(y = 0; y < ins.data.length; y++)
						code.push("var mp$" + (ins.offset + y*m) + " = " + ins.data[y] + ";");
					break;
				case "string":
					code.push("var mp$" + ins.offset + " = " + quotes(ins.data) + ";");
					break;
				case "ieee754":
					// TODO: ..
					break;
				case "array":
					for(y = 0; y < ins.data.length; y++)
						code.push("var mp$" + (ins.offset + y*4) + " = [0, " + ins.data[1] + ", []];");
					break;
				case "set":
					// TODO: ?!#
					break;
				case "pop":
					// TODO: ?!#
					break;
				case "longs":
					for(y = 0; y < ins.data.length; y++)
						code.push("var mp$" + (ins.offset + y*8) + " = [" + ins.data[0] + ", " + ins.data[1] + "];");
			}
		code.push("function main(mp, fps, pc){");
		code.push(" var fp = fps[1];");
		code.push(" switch(pc){");
		for(x = 0; x < source.code.length; x++){
			code.push("  case " + x + ":");
			switch((ins = source.code[x])[0]){
				case 0x0: // nop
					break;
				case 0x2c: // movb
				case 0x2d: // movw
				case 0x2e: // movf
					code.push("   " + operand(ins, 2) + " = " + operand(ins, 1) + ";");
					break;
				case 0x3a: // addw
					code.push("   " + operand(ins, 2) + " = " + operand(ins, 1) + " + " + operand(ins, 0) + ";"); 
					break;
				default:
					code.push("   // unknown instruction: " + ins[0]);
			}
		}
		code.push(" }");
		code.push("}");
		return code.join("\n");
	}

	var t;
	print(showstuff(t = read(test)));
	print(compile(t));
}();
