import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { buildTemplateCsv, parseCsv, validateRows, MODE_COLUMNS } from "@/lib/hrms/bulkCompensationCsv";

const emps:any = [
  { id:"a", badge_id:"10", first_name:"Sushil", last_name:"Verma", is_active:true, total_salary:220000, pf_enabled:true, esi_enabled:false, pt_enabled:true },
  { id:"b", badge_id:"71", first_name:"Abhishek", last_name:"Tomar", is_active:false, total_salary:100000, pf_enabled:null, esi_enabled:null, pt_enabled:null },
];
const rzp = { a: "10" };

describe("bulk csv", () => {
  it("template lists all employees, active first", () => {
    const csv = buildTemplateCsv("addition", emps);
    const { header, rows } = parseCsv(csv);
    expect(header.slice(0,2)).toEqual(["badge_id","employee_name"]);
    expect(header.slice(2)).toEqual(MODE_COLUMNS.addition);
    expect(rows.length).toBe(2);
    expect(rows[0][0]).toBe("10");
    expect(rows[1][1]).toContain("(Separated)");
  });

  it("blank rows skip, valid apply, invalid error", () => {
    const csv = buildTemplateCsv("addition", emps);
    const { header, rows } = parseCsv(csv);
    const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth()+1);
    const ym = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,"0")}`;
    rows[0] = ["10","Sushil Verma","5000","Diwali bonus",ym,"bonus","yes",""];
    const out = validateRows("addition", header, rows, emps, rzp);
    expect(out[0].status).toBe("apply");
    expect(out[1].status).toBe("skip");
    // unlinked employee
    rows[1] = ["71","Abhishek","5000","x",ym,"bonus","yes",""];
    const o2 = validateRows("addition", header, rows, emps, rzp);
    expect(o2[1].status).toBe("error");
    expect(o2[1].error).toMatch(/RazorpayX/);
    // backdated
    rows[0][4] = "2020-01";
    expect(validateRows("addition", header, rows, emps, rzp)[0].error).toMatch(/earlier/);
  });

  it("ctc requires reason for promotion", () => {
    const { header, rows } = parseCsv(buildTemplateCsv("recurring", emps));
    rows[0] = ["10","S","300000","","promotion","2026-09-01",""];
    expect(validateRows("recurring", header, rows, emps, rzp)[0].error).toMatch(/reason/);
    rows[0][6] = "Promoted";
    expect(validateRows("recurring", header, rows, emps, rzp)[0].status).toBe("apply");
  });

  it("statutory blank keeps value, unknown errors", () => {
    const { header, rows } = parseCsv(buildTemplateCsv("statutory", emps));
    rows[0] = ["10","S","no","","","","Exempt"];
    const o = validateRows("statutory", header, rows, emps, rzp);
    expect(o[0].status).toBe("apply");
    expect(o[0].summary).toMatch(/PF: Exempt/);
    rows[1] = ["71","A","yes","","","","x"];
    expect(validateRows("statutory", header, rows, emps, rzp)[1].error).toMatch(/unknown/);
  });

  it("unknown badge errors", () => {
    const { header } = parseCsv(buildTemplateCsv("one_time", emps));
    const o = validateRows("one_time", header, [["999","Ghost","500","bonus","2026-08-01","x",""]], emps, rzp);
    expect(o[0].error).toMatch(/No employee/);
  });
});
