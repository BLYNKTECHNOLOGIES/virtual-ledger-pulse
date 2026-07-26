import sys

file_path = 'supabase/functions/razorpay-payroll-proxy/index.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

start_line = -1
end_line = -1
for i, line in enumerate(lines):
    if 'if (action === "create_person") {' in line:
        start_line = i
    if start_line != -1 and 'return json(200, {' in line and 'enrichment_applied: enrichmentApplied,' in line:
        # Found the end of the block
        # We need to find the closing brace of the action === "create_person" block
        # It's usually a few lines after the return.
        for j in range(i, len(lines)):
            if lines[j].strip() == '}':
                end_line = j
                break
        if end_line != -1:
            break

if start_line == -1 or end_line == -1:
    print(f"Could not find create_person block: start={start_line}, end={end_line}")
    sys.exit(1)

print(f"Found create_person block from line {start_line+1} to {end_line+1}")

# We will replace the entire block with a more robust version.
# But instead of rewriting everything (it's 700 lines!), let's just surgically remove the early returns.

new_lines = []
for i in range(len(lines)):
    line = lines[i]
    
    # 1. Early return for already_mapped (line 5370ish)
    if i > start_line and i < end_line:
        if 'if (existingMap?.razorpay_employee_id) {' in line:
            # We want to keep setting rpId but NOT return.
            new_lines.append('      let rpId: string | null = null;\n')
            new_lines.append('      if (existingMap?.razorpay_employee_id) {\n')
            new_lines.append('        rpId = existingMap.razorpay_employee_id;\n')
            new_lines.append('      }\n')
            # Skip the next few lines until the end of the original if block
            # Original:
            # if (existingMap?.razorpay_employee_id) {
            #   return json(200, { ... });
            # }
            continue
        if 'reason: "already_mapped",' in line or 'already_mapped: true,' in line or 'razorpay_employee_id: existingMap.razorpay_employee_id,' in line:
             if 'return json(200,' in lines[i-1] or 'return json(200,' in lines[i-2]:
                 continue
        if '});' in line and i > start_line + 10 and 'already_mapped' in lines[i-3]:
             continue
             
    new_lines.append(line)

# This is too complex with line-by-line replacement for such a big file.
# I'll try to find the specific patterns.

