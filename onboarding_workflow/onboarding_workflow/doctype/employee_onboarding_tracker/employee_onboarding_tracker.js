// Copyright (c) 2025, Akram Mutaher and contributors
// For license information, please see license.txt

frappe.ui.form.on("Employee Onboarding Tracker", {
	refresh: function (frm) {
		frm.trigger("show_summary");
		if (frm.doc.project) {
			frm.add_custom_button(
				__("Project"),
				function () {
					frappe.set_route("Form", "Project", frm.doc.project);
				},
				__("View"),
			);
			frm.add_custom_button(
				__("Task"),
				function () {
					frappe.set_route("List", "Task", { project: frm.doc.project });
				},
				__("View"),
			);
		}
		if (
			frm.doc.docstatus === 1 &&
			(frm.doc.boarding_status === "Pending" || frm.doc.boarding_status === "In Process")
		) {
			frm.add_custom_button(__("Mark as Completed"), function () {
				frm.trigger("mark_as_completed");
			});
		}
	},

	onboarding_tracker_template: function (frm) {
		frm.set_value("activities", "");
		if (frm.doc.onboarding_tracker_template) {
			frappe.call({
				method: "hrms.controllers.employee_boarding_controller.get_onboarding_details",
				args: {
					parent: frm.doc.onboarding_tracker_template,
					parenttype: "Onboarding Tracker Template",
				},
				callback: function (r) {
					if (r.message) {
						r.message.forEach((d) => {
							frm.add_child("activities", d);
						});
						refresh_field("activities");
					}
				},
			});
		}
	},

	mark_as_completed(frm) {
		frm.call({
			method: "mark_onboarding_as_completed",
			doc: frm.doc,
			freeze: true,
			freeze_message: __("Completing onboarding"),
		}).then((r) => {
			frm.refresh();
		});
	},

	show_summary(frm) {
		if (frm.doc.__islocal) return;

		frappe
			.call("onboarding_workflow.onboarding_workflow.doctype.employee_onboarding_tracker.employee_onboarding_tracker.get_onboarding_summary", {
				onboarding_name: frm.doc.name,
			})
			.then((r) => {
				if (r.message) {
					frm.dashboard.add_indicator(
						__("Open: {0}", [r.message.open]),
						"orange",
					);
					frm.dashboard.add_indicator(
						__("Working: {0}", [r.message.working]),
						"blue",
					);
					frm.dashboard.add_indicator(
						__("Completed: {0}", [r.message.completed]),
						"green",
					);
				}
			});
	},
});

frappe.ui.form.on('Employee Onboarding Tracker', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 1 && frm.doc.required_assets && frm.doc.required_assets.length > 0) {

            const has_asset_movement_rows = frm.doc.required_assets.some(row =>
                row.asset && !row.asset_movement
            );

            if (has_asset_movement_rows) {
                frm.add_custom_button(__('Asset Movement'), function () {
                    create_asset_movement(frm);
                }, __('Create'));
            }

            const has_material_request_rows = frm.doc.required_assets.some(row =>
                !row.asset && !row.material_request
            );

            if (has_material_request_rows) {
                frm.add_custom_button(__('Material Request'), function () {
                    create_material_request(frm);
                }, __('Create'));
            }

			if (frm.doc.required_assets.some(row =>
                row.asset_movement)) {
                frm.add_custom_button(
                	__("Asset Movements"),
                	function () {
                	    const movement_names = frm.doc.required_assets
                	        .filter(row => row.asset_movement)
                	        .map(row => row.asset_movement);

                	    frappe.set_route("List", "Asset Movement", {
                	        name: ["in", movement_names]
                	    });
                	},
                	__("View"));
            }

			if (frm.doc.required_assets.some(row =>
                row.material_request)) {
                frm.add_custom_button(
                	__("Material Requests"),
                	function () {
                	    // Collect all non-empty material_request references from child table
                	    const mr_names = frm.doc.required_assets
                	        .filter(row => row.material_request)
                	        .map(row => row.material_request);

                	    // Route to Material Request list, filtering by these names
                	    frappe.set_route("List", "Material Request", {
                	        name: ["in", mr_names]
                	    });
                	},
                	__("View"));
            }

        }
    }
});

// Create Asset Movement
function create_asset_movement(frm) {
    const assets = frm.doc.required_assets.filter(row => row.asset && !row.asset_movement);

    frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: {
                doctype: "Asset Movement",
                company: frm.doc.company,
                purpose: "Issue",
                assets: assets.map(row => ({
                    asset: row.asset,
					to_employee: frm.doc.employee
                }))
            }
        },
        callback: function(res) {
            if (!res.exc && res.message) {
                const movement = res.message;
				const updates = assets.map(row => {
				    return {
				        name: row.name,
				        field: "asset_movement",
				        value: movement.name
				    };
				});

				frappe.call({
				    method: "onboarding_workflow.onboarding_workflow.doctype.employee_onboarding_tracker.employee_onboarding_tracker.update_onboarding_child_links",  // replace with actual path or use server script
				    args: {
				        child_doctype: "Required Assets",
				        updates: updates
				    },
				    callback: function(r) {
				        if (r.message === "success") {
				            frm.reload_doc();
				            frappe.set_route("Form", "Asset Movement", movement.name);
				        } else {
				            frappe.msgprint(__("Failed to update child table."));
				        }
				    }
				});
            } else {
                frappe.msgprint(__('Failed to create Asset Movement.'));
            }
        }
    });
}

// Create Material Request
function create_material_request(frm) {
    const items = frm.doc.required_assets.filter(row => !row.asset && !row.material_request);

    frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: {
                doctype: "Material Request",
                company: frm.doc.company,
                material_request_type: "Purchase",
                items: items.map(row => ({
                    item_code: row.item,
                    schedule_date: frappe.datetime.add_days(frappe.datetime.get_today(), 7),
                    qty: 1
                }))
            }
        },
        callback: function(res) {
            if (!res.exc && res.message) {
                const mr = res.message;

                const updates = items.map(row => {
				    return {
				        name: row.name,
				        field: "material_request",
				        value: mr.name
				    };
				});

				frappe.call({
				    method: "onboarding_workflow.onboarding_workflow.doctype.employee_onboarding_tracker.employee_onboarding_tracker.update_onboarding_child_links",  // replace with actual path or use server script
				    args: {
				        child_doctype: "Required Assets",
				        updates: updates
				    },
				    callback: function(r) {
				        if (r.message === "success") {
				            frm.reload_doc();
				            frappe.set_route("Form", "Material Request", mr.name);
				        } else {
				            frappe.msgprint(__("Failed to update child table."));
				        }
				    }
				});
            } else {
                frappe.msgprint(__('Failed to create Material Request.'));
            }
        }
    });
}
