#!/bin/bash
# set-project-priority.sh - 为 Project items 设置 Priority 字段

PROJECT_NUMBER=3
OWNER="tongsh6"

echo "🎯 为 Project #$PROJECT_NUMBER 的 items 设置 Priority..."
echo ""

# 获取 Priority 字段 ID
PRIORITY_FIELD_ID="PVTSSF_lAHOALHgF84BRkPlzg_W5q4"

# Priority 选项 IDs
P0_ID="81a2278d"
P1_ID="c2faa550"
P2_ID="a512bc86"

# 设置 P0 items (Milestone A 核心功能 - 已完成但设置优先级)
echo "🔴 设置 P0 items..."

# 设置 P1 items (高优先级设计任务)
echo "🟠 设置 P1 items..."
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHGE" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P1_ID 2>/dev/null || echo "  #18 Rule System"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHHc" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P1_ID 2>/dev/null || echo "  #24 MCP Exposure"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHXM" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P1_ID 2>/dev/null || echo "  #19 Signal Extraction"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHU8" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P1_ID 2>/dev/null || echo "  #21 Roadmap"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHYQ" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P1_ID 2>/dev/null || echo "  #17 Roadmap Proposal"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHZg" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P1_ID 2>/dev/null || echo "  #16 Architecture"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHak" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P1_ID 2>/dev/null || echo "  #15 Action Intelligence"

# 设置 P2 items (中优先级任务)
echo "🟡 设置 P2 items..."
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHT8" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P2_ID 2>/dev/null || echo "  #25 Signal Monitor"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHWk" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P2_ID 2>/dev/null || echo "  #20 Action Executor"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHbY" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P2_ID 2>/dev/null || echo "  #11 Config Precedence"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHcY" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P2_ID 2>/dev/null || echo "  #10 LLM Discovery"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHdo" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P2_ID 2>/dev/null || echo "  #9 Provider Discovery"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHfA" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P2_ID 2>/dev/null || echo "  #6 Auto-Skill"
gh project item-edit $PROJECT_NUMBER --owner $OWNER --id "PVTI_lAHOALHgF84BRkPlzgnUHgY" --field-id $PRIORITY_FIELD_ID --single-select-option-id $P2_ID 2>/dev/null || echo "  #5 Discovery Umbrella"

echo ""
echo "✅ 设置完成！"
echo ""
echo "查看 Project: https://github.com/users/tongsh6/projects/3"
