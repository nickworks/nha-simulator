const contents = get("#contents")[0];
const toolbar = get("#toolbar")[0];
const style = child(document.head, tag('style'));

const Column = class {
    constructor(name, desc, calc = null, code = []){
        this.name = name;
        this.desc = desc;
        this.hidden = false;
        this._calc = calc;
        this.code = code;
    }
    calc(state){
        if(this._calc){
            state[this.name] = this._calc(state);
        }
    }
    is_calc(){
        return (this._calc) ? true : false;
    }
}
const User = class { 
    constructor(name){
        this.name = name;
    }
};
const Job = class {
    static RATE_BULK = 1;
    static RATE_ONDEMAND = 2;
    constructor(user, qty, rate, allocations){
        this.user = user;
        this.qty = qty;
        this.rate = rate;
        this.isPrinted = false;
        this.allocations = [];
        this.updateTimestamp();
        this.qty_printed = 0;
        this.number = parseInt(Math.random() * 1000000 + 1000000);
        allocations?.forEach(a => this.add(a.qty, a));
    }
    updateTimestamp(){
        this.timestamp = Date.now();
    }
    qty_allocated(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.isPrinted && this.timestamp < a.obj.timestamp) return;
            if(this.rate == Job.RATE_BULK) {
                if(a.obj.type == Allocation.TYPE_ORDER && a.obj.order.type == Order.TYPE_BULK) amount += a.amt;
                if(a.obj.type == Allocation.TYPE_EXTRA_NHA) amount += a.amt;
            } else {
                if(a.obj.type == Allocation.TYPE_ORDER && a.obj.order.type == Order.TYPE_ADDITIONAL) amount += a.amt;
                if(a.obj.type == Allocation.TYPE_EXTRA_PW) amount += a.amt;
            }
        });
        return amount;
    }
    qty_extra_printed(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.isPrinted && this.timestamp < a.obj.timestamp) return;
            if(a.obj.type == Allocation.TYPE_EXTRA_NHA) amount += a.amt;
            if(a.obj.type == Allocation.TYPE_EXTRA_PW) amount += a.amt;
        });
        return amount;
    }
    qty_to_print(){
        let amount = 0;
        this.allocations.forEach(a => {
            amount += a.amt;
        });
        return amount;
    }
    qty_soaked_up(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.isPrinted && this.timestamp > a.obj.timestamp) return;
            if(a.obj.type == Allocation.TYPE_ORDER) amount += a.amt;
        });
        return amount;
    }
    add(qty, allocation){
        this.allocations.push({
            obj:allocation,
            amt:qty,
            desc: function(jobTimestamp){
                return this.obj.desc_from_pivot(this.amt, jobTimestamp);
            },
        });
    }
    print(qty){
        this.isPrinted = true;
        this.qty_printed = qty ? parseInt(qty) : this.qty_to_print();
        this.updateTimestamp();
    }
    desc(){
        const timestamp = new Date(this.timestamp).toLocaleTimeString('en-us', { hour:"numeric", minute:"numeric", second:"numeric" });
        return tag('span', [
            tag('span.num', ''+this.qty_printed),
            tag('span', ' printed'),
            tag("span.byline", [
                tag("span", "by "),
                tag("a", this.user, {"href":"#"}),
                tag("span", " at " + timestamp),
            ]),
        ]);
    }
    lineTypeClasses(){
        return ['pw'];
    }
};
const Allocation = class {
    static TYPE_ORDER = 1;
    static TYPE_EXTRA_NHA = 2;
    static TYPE_EXTRA_PW = 3;
    constructor(user, qty, type, order){
        this.qty = qty;
        this.type = type;
        this.order = order;
        this.coveredByPreviousJob = false;
        this.timestamp = Date.now();
        this.user = user;
    }
    desc_from_pivot(qty, jobTimestamp){
        let parts = [tag('span.num', '' + (qty ?? this.qty))];
        const timestamp = new Date(this.timestamp).toLocaleTimeString('en-us', { hour:"numeric", minute:"numeric", second:"numeric" });
        switch(this.type){
            case Allocation.TYPE_ORDER:
                const order_type = (this.order.type == Order.TYPE_BULK) ? "Bulk" : "Additional"
                parts.push(tag('span', ' for '+ order_type +' order '), tag('a', '#'+this.order.number, {'href':'#'}));
                if(timestamp > jobTimestamp){
                    // TODO: show how much was soaked up: NHA or PW
                }
                break;
            case Allocation.TYPE_EXTRA_NHA: parts.push(tag('span', ' extra allocated for NHA')); break;
            case Allocation.TYPE_EXTRA_PW:  parts.push(tag('span', ' extra allocated for Pageworks')); break;
        }
        parts.push(tag("span.byline", [
            tag("span", "by "),
            tag("a", this.user, {"href":"#"}),
            tag("span", " at " + timestamp),
        ]));
        return tag('span', parts);
    }
    isForPageworks(){
        return (this.type == Allocation.TYPE_EXTRA_PW);
    }
    lineTypeClasses(jobTimestamp){
        if(this.isForPageworks()) return ['pw'];
        
        // if timestamp of allocation is after the job timestamp (time of printing),
        // the allocation must be here to soak up extra allocated units
        if(this.timestamp > jobTimestamp) return ['delegated'];

        return ['bulk-allocation'];
    }
};
const Order = class {
    static TYPE_BULK = 1;
    static TYPE_ADDITIONAL = 2;
    constructor(user, qty, type){
        this.user = user;
        this.qty = qty;
        this.type = type;
        this.timestamp = Date.now();
        this.number = parseInt(Math.random() * 1000000 + 1000000);
        this.allocation = new Allocation(user, qty, Allocation.TYPE_ORDER, this);
    }
};
const Year = class {
    constructor(year, actions){
        this.year = year;
        this.actions = actions ?? [];
        this.jobs = [];
        this.orders = [];
        this.allocations = [];
        this.hidden = true;
    }
    // #region Public interface
    addAction(action){
        this.actions.push(action);
    }
    addJob(job){
        this.jobs.push(job);
    }
    addOrder(order){
        this.orders.push(order);
    }
    addAllocation(allocation){
        this.allocations.push(allocation);
    }
    // calculates the distribution of allocations against printed jobs
    // any undelegated portions are added to an unprinted (and unstored) job 
    get_jobs(returnUnprintedJob=false){
        // this method determines how each allocation is distributed
        // across the printed jobs -- any left over allocations assigned
        // to a future, unprinted job

        // though this calculation is complicated,
        // it only needs to parse a single year's data
        const jobs = this.jobs.slice();
        const RATE = jobs.length > 0 ? Job.RATE_ONDEMAND : Job.RATE_BULK;
        const unprintedJob = new Job(data.current_user, 0, RATE, []);
        this.allocations.forEach(a => {
            let delegatedToJob = 0;
            jobs.forEach(j => {
                const printed = j.isPrinted ? j.qty_printed : j.qty_to_print();
                let printed_but_unallocated = j.qty_extra_printed() - j.qty_soaked_up();
                const pivot = j.allocations.filter(a2 => a2.obj == a)[0]??null;
                if(pivot){
                    // job already has a portion of this allocation
                    delegatedToJob += pivot.amt;
                    printed_but_unallocated -= pivot.amt;
                } else if (printed_but_unallocated > 0) {
                    // if the job can absorb some of the allocation
                    // determine how much could be delegated to this job
                    let take = Math.min(printed_but_unallocated, a.qty);
                    printed_but_unallocated -= take;
                    delegatedToJob += take;
                    j.add(take, a);
                }
            });
            // how much is left to delegate of this allocation
            const leftToDelegate = a.qty - delegatedToJob;
            // add any remainder to the unprinted job
            if(leftToDelegate > 0) {
                // if job contains a bulk order, the job is at the bulk rate
                if(a.type == Allocation.TYPE_ORDER && a.order.type == Order.TYPE_BULK) {
                    unprintedJob.rate = Job.RATE_BULK;
                }
                unprintedJob.add(leftToDelegate, a);
            }
        });
        return returnUnprintedJob ? unprintedJob : [...jobs, unprintedJob];
    }
    make_allocation(){
        const existingAllocation = this.allocations.find(a => a.type == Allocation.TYPE_EXTRA_NHA);
        let allocateAmount = 0;
        if(existingAllocation){
            allocateAmount = window.prompt("How much total EXTRA should we print for NHA this year?", existingAllocation.qty);
        } else {
            allocateAmount = window.prompt("How much EXTRA should we print for NHA?\n • 0 to cancel", 0);
        }
        if (allocateAmount > 0) {
            // find an existing allocation of TYPE_EXTRA_NHA for this year
            if(existingAllocation) {
                existingAllocation.qty = allocateAmount;
            } else {
                this.addAllocation(new Allocation(data.current_user, allocateAmount, Allocation.TYPE_EXTRA_NHA));
            }
            render_page();
        }
    }
    print_job(qty = 0){
        const newJob = this.get_jobs(true);
        const q =  newJob.qty_to_print();
        const secondPart = "\n • " + (q > 0 ?  "any more than " + q : "all") + " will be allocated to PW";
        const printAmount = window.prompt("Print how much?" + secondPart + "\n • 0 to cancel", q);
        if (printAmount > 0) {
            if(printAmount > q){
                const amt = printAmount - q;
                newJob.add(amt, new Allocation(data.current_user, amt, Allocation.TYPE_EXTRA_PW));
            }
            newJob.print(printAmount);
            this.addJob(newJob);
            render_page();
        }
    }
    // #endregion
    // #region Rendering html
    render_history_item(classes, desc, timestamp){
        return tag(
            [
                'div.line',
                ...classes,
            ].join('.'),
            desc,
            {'data-timestamp':timestamp},
        );
    }
    render(){
        let i = 0;
        const year = this;
        const jobs = this.get_jobs();
        
        const data_row = tag('tr.year-jobs', [
            tag('td.jobs', jobs.map(job => {
                i++;
                const lineItems = [
                    // render the allocations delegated to this job
                    ...job.allocations.map(a => {
                        return this.render_history_item(a.obj.lineTypeClasses(job.timestamp), a.desc(job.timestamp), a.obj.timestamp);
                    }),
                    // render the printings of this job
                    job.isPrinted ? this.render_history_item(job.lineTypeClasses(), job.desc(), job.timestamp) : null,
                ]
                .filter(item => item != null)
                .sort((a, b) => { 
                    // sort by timestamp
                    if (a.dataset.timestamp < b.dataset.timestamp) return -1; 
                    if (a.dataset.timestamp > b.dataset.subject) return 1; 
                    return 0; 
                });
    
                const showBttnJob = !job.isPrinted && data.current_user == "PW User";
                const showBttnAllocate = !job.isPrinted && data.current_user == "NHA User" && job.rate == Job.RATE_BULK;
                const allocateText = job.allocations.filter(a => a.obj.type == Allocation.TYPE_EXTRA_NHA).length == 0 ? "Allocate More" : "Edit Allocation";
                const showJobId = job.isPrinted;

                let pricing = '';
                switch(job.rate){
                    case Job.RATE_BULK: pricing = 'bulk'; break;
                    case Job.RATE_ONDEMAND: pricing = 'on-demand'; break;
                }
                return tag('div.job', [
                    tag('div.header', [
                        tag('span.grow', [
                            tag('span.num', ''+job.qty_allocated()),
                            tag('span', ' allocated at '),
                            tag('span.pill.big', pricing),
                            tag('span', ' pricing'),
                        ]),
                        tag('span.grow', job.isPrinted ? [
                            tag('span.num', ''+job.qty_printed),
                            tag('span', ' printed'),
                        ] : [
                            tag('span.num', ''+job.qty_to_print()),
                            tag('span', ' to print'),
                        ]),
                        ,
                        job.isPrinted ? tag('span.grow', [
                            tag('span.num', job.qty_soaked_up() + ' / ' + job.qty_extra_printed()),
                            tag('span', ' absorbed'),
                        ]) : null,
                        tag('span', [
                            showBttnJob ? tag('button', 'Make Job', {'onclick':()=>year.print_job()}) : null,
                            showBttnAllocate ? tag('button', allocateText, {'onclick':()=>year.make_allocation()}) : null,
                            showJobId ? tag('span.job-number', [
                                tag('span', 'Job '),
                                tag('a', '#' + job.number, {'href':'#'}),
                            ]) : null,
                        ]),
                    ]),
                    ...lineItems??[],
                ]);
            }), {'colspan':'5'}),
        ]);
        
        // visibility of year
        data_row.style.display = this.hidden ? 'none' : '';
        const bttn = gui.make_button(this.hidden ? 'Show jobs' : 'Hide jobs', ()=>{
            const show = this.hidden;
            this.hidden = !show;
            data_row.style.display = show ? '' : 'none';
            bttn.innerHTML = show ? 'Hide jobs' : 'Show jobs';
            return true;
        });

        let total_printed = 0;
        this.jobs.forEach(j => {
            total_printed += j.qty_printed;
        });
        return [
            tag('tr.year-head', [
                tag('td', data.sku),
                tag('td', this.year),
                tag('td', ''+total_printed),
                tag('td', ''+jobs[jobs.length - 1].qty_to_print()),
                tag('td', bttn),
            ]),
            data_row,
        ];
    }
    // #endregion
};
// referenced before to indicate those fields that are currently calculated in the method below
const product_service = ['ProductService->fetch_quantities_by_variant()'];
// application state
const data = {
    options: {
        display_allocations: true,
        display_details: false,
    },
    sku: 'ABCD-1234',
    users:[],
    by_year:[],
    years: [
        '2023-24',
        '2024-25',
        '2025-26',
    ],
    users: [
        "PW User",
        "NHA User",
    ],
    current_user:"PW User",
    init(){
        this.years.forEach(y => this.add_or_fetch_year(y));
        data.current_user = this.users[0];
    },
    add_or_fetch_year(year){
        if(year in data.by_year) return data.by_year[year];
        
        const action = this.make_start_state();
        const y = new Year(year, [action]);
        data.by_year[year] = y;
        return y;
    },
    make_start_state(){
        const empty_vals = {};
        tables.columns.forEach(f => {
            empty_vals[f.name] = 0;
        });
        return empty_vals;
    },
    get_year(year){
        const d = data.by_year[year] ?? [];
        return (d.length > 0)
            ? JSON.parse(JSON.stringify(d[d.length - 1]))
            : data.make_start_state(year);
    },
}
// the toolbar
const gui = {
    make_button:(caption, callback, attr)=> {
        return tag('button',caption, {
            "onmousedown": callback,
            ...attr,
        });
    },
    render:function(){
        const dd1 = tag('select.years', data.years.map(n => tag('option', n)));
        const dd2 = tag('select.actions', Object.keys(gui.actions).map(n => tag('option', n)));
        const amt = tag('input.quantity', null, {"type": "number", "value": 0, "min": 0, "size": "4", "maxlength": "4"});
        const op1 = tag('input', null, {"type": "checkbox", "value": "yes", "id":"toggle1", "name":"display_allocations", "checked" : data.options.display_allocations});
        const op2 = tag('input', null, {"type": "checkbox", "value": "yes", "id":"toggle2", "name":"display_details", "checked" : data.options.display_details});
        op1.onclick = op2.onclick = () => {
            data.options.display_allocations = op1.checked;
            data.options.display_details = op2.checked;
            render_page();
        };
        toolbar.onsubmit = (e) => {
            e.preventDefault();
            gui.perform_action(dd1.value, dd2.value, amt.value);
            data.options.display_allocations = op1.checked;
            data.options.display_details = op2.checked;
            return false;
        };
        const dd_user = tag('select.users', data.users.map(n => tag('option', n)));
        dd_user.onchange = () => {
            data.current_user = dd_user.value;
            render_page();
        };
        return child(toolbar, [
            dd1, // dropdown: year
            dd2, // dropdown: action
            amt, // input: quantity
            tag('span', ' as NHA User '),
            gui.make_button("Submit", ()=>{}, {'type':'submit'}), // submit button
            // options
            tag('span.options', [
                dd_user,
                tag('span', 'show'),
                op1, // checkbox 1
                tag('label', 'allocations', {'for':'toggle1'}),
                op2, // checkbox 2
                tag('label', 'details', {'for':'toggle2'}),
            ]),
        ]);
    },
    perform_action(year, action, amt){
        // get action funtion
        const calc = gui.actions[action];
        if(!calc) return;
        amt = parseInt(amt);
        try {
            const y = data.add_or_fetch_year(year);
            const entry = data.make_start_state(year);
            entry['desc'] = `${action} (${amt})`;

            // call the action
            calc(y, entry, amt);

            // call each columns' calc()
            tables.columns.forEach(c => c.calc(entry));
            
            render_page();
        } catch (e){
            alert(e);
        }
    },
    actions: {
        /* deprecated -- unnecessary due to the wireframes
        "NHA allocates extra on-hand":(year, obj, amt) => {
            if(year.allocations.filter(a => a.type == Allocation.TYPE_EXTRA_NHA).length > 0){
                throw new Error("NHA has already allocated extra on-hand for this year.");
            }
            obj['nha_preorder'] += amt;
            year.addAction(obj);
            year.addAllocation(new Allocation(data.current_user, amt, Allocation.TYPE_EXTRA_NHA));
        },
        "PW allocates extra on-hand":(year, obj, amt) => {
            obj['pw_extra'] += amt;
            year.addAction(obj);
            year.addAllocation(new Allocation(data.current_user, amt, Allocation.TYPE_EXTRA_PW));
        },
        "PW print job": (year, obj, amt) => {
            //if(obj['need_to_print'] < amt){
            //    throw new Error("Not enough allocated");
            //}
            obj['produced'] += amt;
            obj['in_production'] += amt;
            year.addAction(obj);
            year.print_job(amt);
        },
        */
        "Bulk order": (year, obj, amt) => {
            obj['ordered'] += amt;
            year.addAction(obj);
            const order = new Order("NHA User", amt, Order.TYPE_BULK);
            year.addOrder(order);
            year.addAllocation(order.allocation);
            // TODO: trigger inventory conversion
            // automatically convert PW inventory to NHA
            //  > if it's a Bulk order -> no markup
            //  > if it's an Additional order -> markup
        },
        "Additional order": (year, obj, amt) => {
            obj['ordered'] += amt;
            year.addAction(obj);
            const order = new Order("NHA User", amt, Order.TYPE_ADDITIONAL);
            year.addOrder(order);
            year.addAllocation(order.allocation);
        },
        /* not needed for current demo
        "PW receive inventory": (year, obj, amt) => {
            obj['inv_nha'] += amt;
            obj['received'] += amt;
            if(obj['received'] > obj['produced']) obj['received'] = obj['produced'];
            year.addAction(obj);
        },
        "PW pack shipment": (year, obj, amt) => {
            if(obj['inv_nha'] + obj['inv_pw'] < amt){
                throw new Error("Not enough inventory");
            }
            obj['packed'] += amt;
            const amount_pulling_from_nha = Math.min(obj['inv_nha'], amt);
            if(amount_pulling_from_nha < amt){
                obj['inv_pw'] -= (amt - amount_pulling_from_nha);
            }
            obj['inv_nha'] -= amount_pulling_from_nha;
            year.addAction(obj);
        },
        "PW send shipment": (year, obj, amt) => {
            if(obj['packed'] < amt){
                throw new Error("Not enough packed");
            }
            obj['shipped'] += amt;
            obj['packed'] -= amt;
            year.addAction(obj);
        },
        "PW void shipment": (year, obj, amt) => {
        },
        "PW converts inventory to NHA": (year, obj, amt) => {
            if(amt > obj['inv_pw']){
                throw new Error("Not enough in PW inventory");
            }
            obj['inv_nha'] += amt;
            obj['inv_pw'] -= amt;
            year.addAction(obj);
        },
        */
    },
};
// the original data view
const tables = {
    render: () => child(contents, tables.render_tables()),
    render_tables: () =>  {
        let rows = [];
        for (const [yr, year] of Object.entries(data.by_year)) {
            rows.push(tables.render_table(year))
        }
        return tag('details.year-tables.main', [
            tag('summary', 'Details'),
            gui.make_button('show all fields', ()=> tables.show_all_columns()),
            ...rows,
        ], {
            'open': data.options.display_details ? 'yes' : null,
        })
    },
    render_table:function(year){
        const cells = tables.columns.map(f => {
            return {
                value:f.name,
                highlight:false,
                tooltip:f.desc,
                is_calc:f.is_calc(),
                code:f.code,
            };
        });
        let prev_row = data.make_start_state();
        // each row of data
        return tag('div.year-table', [
            tag('h2','Data for ' + year.year),
            tag("table", [
                tables.render_row(cells, true),
                ...year.actions.map(a => {
                    // each of the columns
                    const vals = tables.columns.map(col => {
                        const f = col.name;
                        return {
                            "value":a[f],
                            "highlight":f != "desc" && a[f] != prev_row[f],
                        };
                    });
                    prev_row = a;
                    return tables.render_row(vals);
                }),
            ]),
        ]);
    },
    render_row:(cells,header) => tag("tr", [
        ...cells.map(cell => {
            // regular row:
            if(!header) return tag(cell.highlight ? 'td.highlight' : 'td', ''+cell.value);
            // header row:
            const parts = ['th'];
            if(cell.is_calc) parts.push('calc');
            if(cell.code.length > 0) parts.push('exists');
            return tag(parts.join('.'), [
                tag('a.tooltip', ''+cell.value, {'data-tooltip': cell.tooltip}, true),
                gui.make_button('hide', this.hide_on_click),
            ]);
        }),
    ]),
    hide_on_click:function(){
        const i = [...this.parentNode.parentNode.children].indexOf(this.parentNode);
        if(i < tables.columns.length) tables.columns[i].hidden = true;
        tables.hide_columns();
    },
    show_all_columns:function(){
        tables.columns.forEach(c => c.hidden = false);
        tables.hide_columns();
    },
    hide_columns:function(){
        while(style.sheet.rules.length > 0) style.sheet.deleteRule(0);
        tables.columns.forEach((f,i) =>{
            if(f.hidden){
                const n = i + 1;
                style.sheet.addRule(`th:nth-child(${n}),td:nth-child(${n})`, 'display:none');
            }
        });
    },
    columns: [
        new Column("desc", "What happened?"),
        new Column("nha_preorder",  "Bulk Order Allocations for NHA - How many they think they're likely to order this year."),
        new Column("pw_extra",  "Extra quantity that PW prints as a gamble."),
        new Column("ordered", "SUM(soli.quantity) WHERE order.status > CART", null, product_service),
        // production:
        new Column("need_to_print", "MAX(nha_preorder + pw_extra, SUM(BO) + SUM(AO)) - produced", s => Math.max(s['nha_preorder'] + s['pw_extra'], s['ordered']) - s['produced']),
        new Column("produced", "SUM(jobs.quantity)"),
        new Column("in_production", "produced - received", s => s['produced'] - s['received']),
        new Column("received", " ??? "),
        // shipping:
        new Column("packed", "SUM(scli.quantity) WHERE shipment.status = NOT SENT", null, product_service),
        new Column("shipped", "SUM(scli.quantity) WHERE shipment.status = SENT", null, product_service),
        // inventory:
        new Column("inv_nha", "SUM(inventory_items.quantity_nha)", null, product_service),
        new Column("inv_pw", "SUM(inventory_items.quantity_pageworks)", null, product_service),
        // calculated from other fields:
        new Column("to_pack", "ordered - shipped - packed", s => s['ordered'] - s['shipped'] - s['packed'], product_service),
        new Column("to_ship", "ordered - shipped", s => s['ordered'] - s['shipped'], product_service),
        new Column("to_receive", "produced - inv_nha - inv_pw - shipped - packed", s => s['produced'] - s['inv_nha'] - s['inv_pw'] - s['shipped'] - s['packed'], product_service),
    ],
};
// the allocation wireframes
const wireframes = {
    render:function(){
        return child(contents, tag('details.main', [
            tag('summary', 'Allocations view'),
            tag('table.allocations', [
                tag('tr.head', [
                    tag('td', 'SKU'),
                    tag('td', 'School Year'),
                    tag('td', 'Amount Printed'),
                    tag('td', 'Need to Print'),
                    tag('td', 'Action'),
                ]),
                // render each year
                ...Object.entries(data.by_year).map(([yr,year]) => year.render()),
            ], {
                'cellpadding':'0',
                'cellspacing':'0',
            }),
        ], {
            "open": data.options.display_allocations ? "yes" : null,
        }));
    },
};
const render_page = ()=> {
    //console.log(data);
    clear(contents);
    child(contents, tag('h1', 'NHA simulator'));
    wireframes.render();
    tables.render();
};
data.init();
gui.render();
render_page();