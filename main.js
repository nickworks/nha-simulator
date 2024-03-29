const contents = get("#contents")[0];
const toolbar = get("#toolbar")[0];
const style = child(document.head, tag('style'));

const User = class { 
    constructor(name){
        this.name = name;
    }
};
const Job = class {
    static RATE_BULK = 1;
    static RATE_ONDEMAND = 2;
    constructor(user, qty, rate){
        this.user = user;
        this.qty = qty;
        this.is_printed = false;
        this.allocations = [];
        this.qty_printed = 0;
        this.number = parseInt(Math.random() * 1000000 + 1000000);
        this.rate = rate;
        this.update_timestamp();
    }
    update_rate(){
        if(this.allocations.length <= 0) return;
        this.rate = (this.qty_extra_printed_nha() > 0) ? Job.RATE_BULK : Job.RATE_ONDEMAND;
    }
    update_timestamp(){
        this.timestamp = Date.now();
    }
    /** The total number of allocated units that aren't guaranteed bulk-pricing. */
    qty_allocated_ondemand(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.is_printed && this.timestamp < a.obj.timestamp) return;
            if(this.rate == Job.RATE_BULK) {
                // "PW extra" allocations in a BULK job have ON-DEMAND pricing
                if(a.obj.type == Allocation.TYPE_EXTRA_PW) amount += a.amt_pw;
            } else {
                // any allocations in an ON-DEMAND job have ON-DEMAND pricing
                amount += a.amt_nha;
                amount += a.amt_pw;
            }
        });
        return amount;
    }
    /** The total number of allocated units that are guaranteed at bulk pricing. */
    qty_allocated_bulk(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.is_printed && this.timestamp < a.obj.timestamp) return;
            if(this.rate == Job.RATE_BULK) {
                // most allocations in a BULK job have BULK pricing
                if(a.obj.type == Allocation.TYPE_ORDER) amount += a.amt_pw + a.amt_nha;
                if(a.obj.type == Allocation.TYPE_EXTRA_NHA) amount += a.amt_nha;
            } else {
                // no allocations in an ON-DEMAND job has BULK pricing
            }
        });
        return amount;
    }
    /** The total number of extra allocated units. */
    qty_extra_printed(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.is_printed && this.timestamp < a.obj.timestamp) return;
            if(a.obj.type == Allocation.TYPE_EXTRA_NHA) amount += a.amt_nha;
            if(a.obj.type == Allocation.TYPE_EXTRA_PW) amount += a.amt_pw;
        });
        return amount;
    }
    /** The total number of extra NHA-allocated units. */
    qty_extra_printed_nha(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.is_printed && this.timestamp < a.obj.timestamp) return;
            if(a.obj.type == Allocation.TYPE_EXTRA_NHA) amount += a.amt_nha;
        });
        return amount;
    }
    /** The total number of extra PW-allocated units. */
    qty_extra_printed_pw(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.is_printed && this.timestamp < a.obj.timestamp) return;
            if(a.obj.type == Allocation.TYPE_EXTRA_PW) amount += a.amt_pw;
        });
        return amount;
    }
    /** The number of extra NHA-allocated units that aren't tied to an order yet. */
    qty_undelegated_nha(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(a.obj.type == Allocation.TYPE_EXTRA_NHA) amount += a.amt_nha;
            if(a.obj.type == Allocation.TYPE_ORDER){
                if(this.timestamp < a.obj.timestamp) amount -= a.amt_nha;
            }
        });
        return amount < 0 ? 0 : amount;
    }
    /** The number of extra PW-allocated units that aren't tied to an order yet. */
    qty_undelegated_pw(){
        let amount = 0;
        this.allocations.forEach(a => {
            if(this.is_printed && this.timestamp < a.obj.timestamp) {
                amount -= a.amt_pw;
            } else {
                amount += a.amt_pw;
            }
        });
        return amount < 0 ? 0 : amount;
    }
    /** The number of units this jobs currently has allocated to print. If the job is printed, this method will return 0. */
    qty_to_print(){
        if(this.is_printed) return 0;
        // if the job isn't printed,
        // add up all existing allocations
        let amount = 0;
        this.allocations.forEach(a => {
            amount += a.amt_pw;
            amount += a.amt_nha;
        });
        return amount;
    }
    /** The number of extra allocated units that are tied to an order. */
    qty_soaked_up(){
        let amount = 0;
        // any allocations after the timestamp count as
        // absorbing the extra quantity from this already printed order
        this.allocations.forEach(a => {
            if(this.is_printed && this.timestamp > a.obj.timestamp) return;
            if(a.obj.type == Allocation.TYPE_ORDER || a.obj.type == Allocation.TYPE_EXTRA_NHA) {
                amount += a.amt_pw;
                amount += a.amt_nha;
            }
        });
        return amount;
    }
    /**
     * Delegate an Allocation to this Job. If the Job isn't yet printed,
     * then the Allocation counts towards how much needs to be printed.
     * After the Job has been printed, any delegated allocations count as the
     * Job using its extra quantity to absorb a portion of the Allocation.
     */
    add_allocation_pivot(qty_nha, qty_pw, allocation){
        this.allocations.push({
            obj:allocation,
            amt_nha:parseInt(qty_nha),
            amt_pw:parseInt(qty_pw),
        });
    }
    /**
     * The job is marked as having been printed. The timestamp and qty_printed are updated.
     */
    print(qty){
        if(this.is_printed) return;
        this.is_printed = true;
        this.qty_printed = qty ? parseInt(qty) : this.qty_to_print();
        this.update_timestamp();
    }
    render_history_item(){
        const when = new Date(this.timestamp).toLocaleTimeString('en-us', { hour:"numeric", minute:"numeric", second:"numeric" });
        return tag('div.line.pw',
            [
                tag('span', [
                    tag('span.num', ''+this.qty_printed),
                    tag('span', ' printed'),
                ]),
                tag("span.byline", [
                    tag("span", "by "),
                    tag("a", this.user, {"href":"#"}),
                    tag("span", " at " + when),
                ]),
            ],
            {'data-timestamp':this.timestamp},
        );
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
    render_history_items(pivot, job){
        let classes = ['bulk-allocation'];
        if(this.type == Allocation.TYPE_EXTRA_PW) classes = ['pw'];
        if(this.timestamp > job.timestamp) classes = ['delegated'];
        const when = new Date(this.timestamp).toLocaleTimeString('en-us', { hour:"numeric", minute:"numeric", second:"numeric" });
        const amount = pivot.amt_nha + pivot.amt_pw;
        let parts = [tag('span.num', '' + amount)];
        let middle = [];
        const doConversion = pivot.amt_pw > 0 && ((this.type == Allocation.TYPE_ORDER && this.order.type == Order.TYPE_BULK) || this.type == Allocation.TYPE_EXTRA_NHA);
        switch(this.type){
            case Allocation.TYPE_ORDER:
                parts.push(
                    tag('span', ' for '+ (this.order.type == Order.TYPE_BULK ? 'Bulk' : 'Additional') +' order '),
                    tag('a', '#'+this.order.number, {'href':'#'}),
                );
                if(this.timestamp > job.timestamp){
                    if(pivot.amt_nha > 0) middle.push(tag('span.pad-sides'), [
                        tag('span', pivot.amt_nha + ' at '),
                        tag('span.pill', ' bulk '),
                    ]);
                    if(pivot.amt_pw > 0) middle.push(tag('span.pad-sides'), 
                        doConversion ? [
                            tag('span', pivot.amt_pw + ' from PW at '),
                            tag('span.pill', ' bulk '),
                        ] : [
                            tag('span', pivot.amt_pw + ' at '),
                            tag('span.pill', ' on-demand '),
                        ],
                    );
                    if(pivot.amt_pw > 0 || pivot.amt_nha > 0){
                        middle.push(tag('span', '&nbsp;from Job '), tag('a', '#' + job.number, {'href':'#'}));
                    }
                }
                break;
            case Allocation.TYPE_EXTRA_NHA:
                parts.push(tag('span', ' extra allocated for NHA'));
                if(this.timestamp > job.timestamp){
                    if(pivot.amt_nha > 0) middle.push(tag('span.pad-sides'), [
                        tag('span', pivot.amt_nha + ' at '),
                        tag('span.pill', ' bulk '),
                    ]);
                    if(pivot.amt_pw > 0) middle.push(tag('span.pad-sides'), 
                        doConversion ? [
                            tag('span', pivot.amt_pw + ' from PW at '),
                            tag('span.pill', ' bulk '),
                        ] : [
                            tag('span', pivot.amt_pw + ' at '),
                            tag('span.pill', ' on-demand '),
                        ],
                    );
                    if(pivot.amt_pw > 0 || pivot.amt_nha > 0){
                        middle.push(tag('span', '&nbsp;from Job '), tag('a', '#' + job.number, {'href':'#'}));
                    }
                }
                break;
            case Allocation.TYPE_EXTRA_PW:  parts.push(tag('span', ' extra allocated for Pageworks')); break;
        }
        return [
            doConversion ? tag('div.line.pw', [
                    tag('span', [
                        tag('span.num', '' + pivot.amt_pw),
                        tag('span', ' converted from PW to NHA'),
                    ]),
                    tag("span.byline", [
                        tag("span", "by "),
                        tag("a", this.user, {"href":"#"}),
                        tag("span", " at " + when),
                    ])
                ],
                {'data-timestamp':this.timestamp - 2},
            ) : null,
            tag([ 'div.line', ...classes ].join('.'), [
                    tag('span', parts),
                    tag('span', middle),
                    tag("span.byline", [
                        tag("span", "by "),
                        tag("a", this.user, {"href":"#"}),
                        tag("span", " at " + when),
                    ])
                ],
                {'data-timestamp':this.timestamp - (doConversion ? 1 : 0)},
            ),
        ];
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
    constructor(year){
        this.year = year;
        this.jobs = [];
        this.orders = [];
        this.allocations = [];
        this.hidden = true;
    }
    // #region Public interface
    add_job(job){
        this.jobs.push(job);
    }
    add_order(order){
        this.orders.push(order);
    }
    add_allocation(allocation){
        this.allocations.push(allocation);
    }
    // calculates the distribution of allocations against printed jobs
    // any undelegated portions are added to an unprinted (and unstored) job 
    get_jobs(return_unprinted_job=false){
        // this method determines how each allocation is distributed
        // across the printed jobs -- any left over allocations assigned
        // to a future, unprinted job

        // though this calculation is complicated,
        // it only needs to parse a single year's data
        const jobs = this.jobs.slice();
        const RATE = jobs.length > 0 ? Job.RATE_ONDEMAND : Job.RATE_BULK;
        const unprinted_job = new Job(data.current_user, 0, RATE);

        this.allocations.forEach(a => {
            let left_to_delegate = a.qty;
            jobs.forEach(j => {
                let available_pw = j.qty_undelegated_pw();
                let available_nha = j.qty_undelegated_nha();
                const pivot = j.allocations.filter(a2 => a2.obj == a)[0]??null;
                if(pivot){
                    // if allocation is already delegated to this job ...
                    const delegated_amount = pivot.amt_nha + pivot.amt_pw;
                    left_to_delegate -= delegated_amount;
                    available_nha -= pivot.amt_nha;
                    available_pw -= pivot.amt_pw;
                } else if (left_to_delegate > 0 && (available_pw > 0 || available_nha > 0)) {
                    // if (there is quantity left to delegate && this job can absorb some of it) ...
                    // determine how much could be delegated to this job ("soaked up")
                    let take_nha = Math.min(available_nha, left_to_delegate);
                    left_to_delegate -= take_nha;
                    available_nha -= take_nha;
                    let take_pw = Math.min(available_pw, left_to_delegate);
                    left_to_delegate -= take_pw;
                    available_pw -= take_pw;
                    
                    // no! cannot add allocations to printed jobs
                    j.add_allocation_pivot(take_nha, take_pw, a);

                    // move to unprinted job:
                    //unprinted_job.add_allocation_pivot(take_nha, take_pw, a);
                }
            });
            // add any remainder to the unprinted job
            if(left_to_delegate > 0) {
                let delegate_nha = 0;
                let delegate_pw = 0;
                if(a.type == Allocation.TYPE_EXTRA_PW){
                    delegate_pw = left_to_delegate;
                } else {
                    delegate_nha = left_to_delegate;
                }
                unprinted_job.add_allocation_pivot(delegate_nha, delegate_pw, a);

                // // if job contains a bulk order, the job is at the bulk rate
                // if(a.type == Allocation.TYPE_ORDER && a.order.type == Order.TYPE_BULK) {
                //     unprinted_job.rate = Job.RATE_BULK;
                // }
                // // if job contains a bulk order, the job is at the bulk rate
                // if(a.type == Allocation.TYPE_ORDER && a.order.type == Order.TYPE_BULK) {
                //     unprinted_job.rate = Job.RATE_BULK;
                // }
            }
        });
        unprinted_job.update_rate();
        return return_unprinted_job ? unprinted_job : [...jobs, unprinted_job];
    }
    make_allocation(){
        const existing_allocation = this.allocations.find(a => a.type == Allocation.TYPE_EXTRA_NHA);
        let amount = 0;
        if(existing_allocation){
            amount = window.prompt("How much total EXTRA should we print for NHA this year?", existing_allocation.qty);
        } else {
            amount = window.prompt("How much EXTRA should we print for NHA?\n \u2022 0 to cancel", 0);
        }
        if (amount > 0) {
            // find an existing allocation of TYPE_EXTRA_NHA for this year
            if(existing_allocation) {
                existing_allocation.qty = amount;
            } else {
                this.add_allocation(new Allocation(data.current_user, amount, Allocation.TYPE_EXTRA_NHA));
            }
            render_page();
        }
    }
    print_job(qty = 0){
        const job = this.get_jobs(true);
        const q =  job.qty_to_print();
        const secondPart = "\n \u2022 " + (q > 0 ?  "any more than " + q : "all") + " will be allocated to PW";
        const amount = window.prompt("Print how much?" + secondPart + "\n \u2022 0 to cancel", q);
        if (amount > 0) {
            if(amount > q){
                const extra_for_pw = amount - q;
                job.add_allocation_pivot(0, extra_for_pw, new Allocation(data.current_user, extra_for_pw, Allocation.TYPE_EXTRA_PW));
            }
            this.add_job(job);
            setTimeout(() => {
                job.print(amount);
                render_page();
            }, 50);
        }
    }
    // #endregion
    // #region Rendering html
    render(){
        let i = 0;
        const year = this;
        const jobs = this.get_jobs();
        
        let absorbedItems = [];
        
        const data_row = tag('tr.year-jobs', [
            tag('td.jobs', jobs.map(job => {
                i++;

                const history = [];
                const bumpedItems = [];
                job.allocations.forEach(a => {
                    a.obj.render_history_items(a, job).forEach(html => {
                        if(html == null) return;
                        if(html.dataset.timestamp < job.timestamp) {
                            history.push(html);
                        } else {
                            bumpedItems.push(html);
                        }
                    });
                });
                
                // filter and sort
                const lineItems = [
                    ...absorbedItems,
                    ...history,
                    job.is_printed ? job.render_history_item() : null,
                ]
                .filter(item => item != null)
                .filter(item => item.dataset.timestamp <= job.timestamp);
                //.sort((a, b) => { 
                //    // sort by timestamp
                //    if (a.dataset.timestamp < b.dataset.timestamp) return -1; 
                //    if (a.dataset.timestamp > b.dataset.subject) return 1; 
                //    return 0; 
                //});
                const thisYearsExtraAllocationJob = this.jobs.filter(j => j.allocations.filter(a => a.obj.type == Allocation.TYPE_EXTRA_NHA).length > 0)[0];
                const thisYearsExtraAllocation = this.allocations.filter(a => a.type == Allocation.TYPE_EXTRA_NHA)[0];
                const show_bttn_job = !job.is_printed && data.current_user == "PW User";
                const show_bttn_allocate = !job.is_printed && data.current_user == "NHA User" && !(thisYearsExtraAllocationJob?.is_printed??false);
                const allocate_text = thisYearsExtraAllocation == null ? "Allocate More" : "Edit Allocation";

                let pricing = '';
                let amount_allocated_at_pricing = 0;
                switch(job.rate){
                    case Job.RATE_BULK:
                        pricing = 'bulk';
                        amount_allocated_at_pricing = job.qty_allocated_bulk();
                        break;
                    case Job.RATE_ONDEMAND:
                        pricing = 'on-demand';
                        job.qty_allocated_ondemand()
                        break;
                }

                absorbedItems = bumpedItems;

                return tag('div.job', [
                    tag('div.header', [
                        tag('span.grow', [
                            tag('span.num', ''+amount_allocated_at_pricing),
                            tag('span', ' allocated at '),
                            tag('span.pill.big', pricing),
                            tag('span', ' pricing'),
                        ]),
                        tag('span.grow', job.is_printed ? [
                            tag('span.num', ''+job.qty_printed),
                            tag('span', ' printed'),
                        ] : [
                            tag('span.num', ''+job.qty_to_print()),
                            tag('span', ' to print'),
                        ]),
                        job.is_printed ? tag('span.grow', [
                            tag('span.num', job.qty_soaked_up() + ' / ' + job.qty_extra_printed()),
                            tag('span', ' absorbed'),
                        ]) : null,
                        tag('span', [
                            show_bttn_job ? tag('button', 'Make Job', {'onclick':()=>year.print_job()}) : null,
                            show_bttn_allocate ? tag('button', allocate_text, {'onclick':()=>year.make_allocation()}) : null,
                            job.is_printed ? tag('span.job-number', [
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
// application state
const data = {
    options: {
        display_allocations: true,
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
        const y = new Year(year);
        data.by_year[year] = y;
        return y;
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
        op1.onclick = () => {
            data.options.display_allocations = op1.checked;
            render_page();
        };
        toolbar.onsubmit = (e) => {
            e.preventDefault();
            gui.perform_action(dd1.value, dd2.value, amt.value);
            data.options.display_allocations = op1.checked;
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
            calc(y, amt);
            render_page();
        } catch (e){
            alert(e);
        }
    },
    actions: {
        "Bulk order": (year, amt) => {
            const order = new Order("NHA User", amt, Order.TYPE_BULK);
            year.add_order(order);
            year.add_allocation(order.allocation);
            // TODO: trigger inventory conversion
            // automatically convert PW inventory to NHA
            //  > if it's a Bulk order -> no markup
            //  > if it's an Additional order -> markup
        },
        "Additional order": (year, amt) => {
            const order = new Order("NHA User", amt, Order.TYPE_ADDITIONAL);
            year.add_order(order);
            year.add_allocation(order.allocation);
        },
    },
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
    //const j = data.by_year['2023-24'].jobs;
    //console.log(j[j.length -1]?.allocations.length??'none');
    clear(contents);
    child(contents, tag('h1', 'NHA simulator'));
    wireframes.render();
};
data.init();
gui.render();
render_page();