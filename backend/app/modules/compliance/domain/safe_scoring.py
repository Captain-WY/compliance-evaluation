from __future__ import annotations

import ast
import math
import operator
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ScoringValidationResult:
    valid: bool
    errors: list[dict[str, Any]]
    sample_result: float | bool | None = None


ALLOWED_FUNCTIONS = {
    "min": min,
    "max": max,
    "abs": abs,
    "round": round,
}

FUNCTION_ARITY = {
    "min": (1, 10),
    "max": (1, 10),
    "abs": (1, 1),
    "round": (1, 2),
}

MAX_EXPRESSION_LENGTH = 500
MAX_AST_NODES = 80
MAX_AST_DEPTH = 20

BINARY_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}

UNARY_OPERATORS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

COMPARISON_OPERATORS = {
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
}


def validate_scoring_rule(
    scoring_rule: dict[str, Any],
    variable_codes: set[str],
    *,
    variable_types: dict[str, str] | None = None,
    sample_values: dict[str, float] | None = None,
) -> ScoringValidationResult:
    try:
        rule_type = scoring_rule.get("ruleType") or scoring_rule.get("rule_type")
        if rule_type == "FORMULA":
            return validate_expression_rule(
                scoring_rule.get("expression") or "",
                variable_codes,
                variable_types=variable_types,
                comparisons_allowed=False,
                sample_values=sample_values,
            )
        if rule_type == "PASS_FAIL":
            return validate_expression_rule(
                scoring_rule.get("expression") or "",
                variable_codes,
                variable_types=variable_types,
                comparisons_allowed=True,
                sample_values=sample_values,
            )
        if rule_type == "INTERVAL":
            return validate_interval_rule(scoring_rule)
        if rule_type == "QUALITATIVE_RUBRIC":
            return validate_qualitative_rubric(scoring_rule)
        return ScoringValidationResult(
            valid=False,
            errors=[
                {
                    "code": "unsupported_rule_type",
                    "message": f"Unsupported rule type {rule_type}",
                }
            ],
        )
    except Exception as exc:
        return ScoringValidationResult(
            valid=False,
            errors=[{"code": "unsupported_token", "message": f"Validation failed: {str(exc)}"}]
        )


def validate_expression_rule(
    expression: str,
    variable_codes: set[str],
    *,
    variable_types: dict[str, str] | None = None,
    comparisons_allowed: bool,
    sample_values: dict[str, float] | None = None,
) -> ScoringValidationResult:
    errors: list[dict[str, Any]] = []
    if not expression.strip():
        return ScoringValidationResult(
            valid=False,
            errors=[{"code": "unsupported_token", "message": "Expression is required"}],
        )
    if len(expression) > MAX_EXPRESSION_LENGTH:
        return ScoringValidationResult(
            valid=False,
            errors=[{"code": "unsupported_token", "message": "Expression is too long"}],
        )

    # Check for dangerous tokens in raw expression string (case-insensitive)
    dangerous_tokens = [
        "eval",
        "function",
        "constructor",
        "__proto__",
        "import",
        "require",
        "<script",
        "javascript:",
    ]
    expr_lower = expression.lower()
    for token in dangerous_tokens:
        if token in expr_lower:
            return ScoringValidationResult(
                valid=False,
                errors=[
                    {
                        "code": "unsupported_token",
                        "message": f"Dangerous token detected: {token}",
                    }
                ],
            )
    try:
        parsed = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        return ScoringValidationResult(
            valid=False,
            errors=[{"code": "unsupported_token", "message": str(exc)}],
        )

    resource_error = _resource_error(parsed)
    if resource_error:
        return ScoringValidationResult(valid=False, errors=[resource_error])

    invalid_sample = _first_invalid_number(sample_values or {})
    if invalid_sample:
        return ScoringValidationResult(valid=False, errors=[invalid_sample])

    _validate_node(
        parsed.body,
        variable_codes,
        variable_types=variable_types or {},
        comparisons_allowed=comparisons_allowed,
        errors=errors,
    )
    if errors:
        return ScoringValidationResult(valid=False, errors=deduplicate_errors(errors))

    values = {code: 1.0 for code in variable_codes}
    values.update(sample_values or {})
    try:
        sample_result = _evaluate_node(parsed.body, values)
    except ZeroDivisionError:
        return ScoringValidationResult(
            valid=False,
            errors=[{"code": "division_by_zero_static", "message": "Division by zero"}],
        )
    except (TypeError, ValueError) as exc:
        return ScoringValidationResult(
            valid=False,
            errors=[{"code": "unsupported_token", "message": str(exc)}],
        )
    if comparisons_allowed:
        if not isinstance(sample_result, bool):
            return ScoringValidationResult(
                valid=False,
                errors=[
                    {
                        "code": "non_boolean_result_for_pass_fail_rule",
                        "message": "PASS_FAIL expression must return boolean",
                    },
                ],
            )
    elif not isinstance(sample_result, int | float):
        return ScoringValidationResult(
            valid=False,
            errors=[
                {
                    "code": "non_numeric_result_for_numeric_rule",
                    "message": "Formula expression must return numeric value",
                },
            ],
        )
    return ScoringValidationResult(valid=True, errors=[], sample_result=sample_result)


def validate_interval_rule(scoring_rule: dict[str, Any]) -> ScoringValidationResult:
    bands = list(scoring_rule.get("bands") or [])
    if not bands:
        return ScoringValidationResult(
            valid=False,
            errors=[
                {
                    "code": "interval_gap_when_required",
                    "message": "At least one band is required",
                },
            ],
        )

    errors: list[dict[str, Any]] = []
    normalized: list[dict[str, float | None]] = []
    for index, band in enumerate(bands):
        min_val = band.get("minValue", band.get("min_value"))
        max_val = band.get("maxValue", band.get("max_value"))

        if min_val is None and max_val is None:
            errors.append({
                "code": "interval_overlap",
                "message": f"Band {index} must have at least one boundary defined",
            })
            continue

        try:
            norm_min = float(min_val) if min_val is not None else None
            if norm_min is not None and not math.isfinite(norm_min):
                raise ValueError()
        except (ValueError, TypeError):
            errors.append({
                "code": "interval_overlap",
                "message": f"Band {index} has invalid minValue: {min_val}",
            })
            continue

        try:
            norm_max = float(max_val) if max_val is not None else None
            if norm_max is not None and not math.isfinite(norm_max):
                raise ValueError()
        except (ValueError, TypeError):
            errors.append({
                "code": "interval_overlap",
                "message": f"Band {index} has invalid maxValue: {max_val}",
            })
            continue

        if norm_min is not None and norm_max is not None and norm_min >= norm_max:
            errors.append({
                "code": "interval_overlap",
                "message": (
                    f"Band {index} lower boundary ({norm_min}) must "
                    f"be less than upper boundary ({norm_max})"
                ),
            })
            continue

        normalized.append({"min": norm_min, "max": norm_max})

    if errors:
        return ScoringValidationResult(valid=False, errors=deduplicate_errors(errors))

    # Sort the normalized bands
    normalized.sort(key=lambda item: float("-inf") if item["min"] is None else item["min"])

    previous_max: float | None = None
    seen_lower_unbounded = False
    seen_upper_unbounded = False
    for index, band in enumerate(normalized):
        min_value = band["min"]
        max_value = band["max"]
        if min_value is None:
            if index != 0 or seen_lower_unbounded:
                errors.append(
                    {
                        "code": "interval_overlap",
                        "message": "Only the first band may be lower-unbounded",
                    },
                )
            seen_lower_unbounded = True
        if seen_upper_unbounded:
            errors.append(
                {
                    "code": "interval_overlap",
                    "message": "Upper-unbounded interval must be the final band",
                },
            )
        if previous_max is not None and min_value is not None:
            if min_value < previous_max:
                errors.append({"code": "interval_overlap", "message": "Interval bands overlap"})
            if scoring_rule.get("requireContinuousBands") and min_value > previous_max:
                errors.append({"code": "interval_gap_when_required", "message": "Interval gap"})
        if previous_max is not None and min_value is None:
            errors.append({"code": "interval_overlap", "message": "Interval bands overlap"})
        if max_value is None:
            seen_upper_unbounded = True
        previous_max = max_value
    return ScoringValidationResult(valid=not errors, errors=deduplicate_errors(errors))


def validate_qualitative_rubric(scoring_rule: dict[str, Any]) -> ScoringValidationResult:
    rubrics = scoring_rule.get("rubrics") or []
    if not rubrics:
        return ScoringValidationResult(
            valid=False,
            errors=[{"code": "unsupported_token", "message": "At least one rubric is required"}],
        )

    errors: list[dict[str, Any]] = []
    codes: list[str] = []
    for index, item in enumerate(rubrics):
        code = item.get("itemCode", item.get("item_code"))
        label = item.get("itemLabel", item.get("item_label"))
        score_val = item.get("score")

        if code is None or str(code).strip() == "":
            errors.append({
                "code": "unsupported_token",
                "message": f"Rubric item {index} is missing itemCode",
            })
        else:
            codes.append(str(code).strip())

        if label is None or str(label).strip() == "":
            errors.append({
                "code": "unsupported_token",
                "message": f"Rubric item {index} is missing itemLabel",
            })

        if score_val is None:
            errors.append({
                "code": "unsupported_token",
                "message": f"Rubric item {index} is missing score",
            })
        else:
            try:
                score_float = float(score_val)
                if not math.isfinite(score_float):
                    raise ValueError()
            except (ValueError, TypeError):
                errors.append({
                    "code": "unsupported_token",
                    "message": f"Rubric item {index} has invalid score",
                })

    if len(codes) != len(set(codes)):
        errors.append({"code": "unsupported_token", "message": "Rubric item codes must be unique"})

    if errors:
        return ScoringValidationResult(valid=False, errors=deduplicate_errors(errors))
    return ScoringValidationResult(valid=True, errors=[])


def _validate_node(
    node: ast.AST,
    variable_codes: set[str],
    *,
    variable_types: dict[str, str],
    comparisons_allowed: bool,
    errors: list[dict[str, Any]],
) -> None:
    if isinstance(node, ast.Constant):
        if not _is_finite_number(node.value):
            errors.append({"code": "unsupported_token", "message": "Only numeric literals allowed"})
        return
    if isinstance(node, ast.Name):
        if node.id not in variable_codes:
            errors.append({"code": "unknown_variable", "message": f"Unknown variable {node.id}"})
        elif variable_types.get(node.id, "NUMBER") != "NUMBER":
            errors.append(
                {
                    "code": "non_numeric_result_for_numeric_rule",
                    "message": f"Variable {node.id} is not numeric",
                },
            )
        return
    if isinstance(node, ast.BinOp):
        if type(node.op) not in BINARY_OPERATORS:
            errors.append({"code": "unsupported_token", "message": "Unsupported operator"})
        if isinstance(node.op, ast.Div) and _is_static_zero(node.right):
            errors.append({"code": "division_by_zero_static", "message": "Division by zero"})
        _validate_node(
            node.left,
            variable_codes,
            variable_types=variable_types,
            comparisons_allowed=comparisons_allowed,
            errors=errors,
        )
        _validate_node(
            node.right,
            variable_codes,
            variable_types=variable_types,
            comparisons_allowed=comparisons_allowed,
            errors=errors,
        )
        return
    if isinstance(node, ast.UnaryOp):
        if type(node.op) not in UNARY_OPERATORS:
            errors.append({"code": "unsupported_token", "message": "Unsupported unary operator"})
        _validate_node(
            node.operand,
            variable_codes,
            variable_types=variable_types,
            comparisons_allowed=comparisons_allowed,
            errors=errors,
        )
        return
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_FUNCTIONS:
            errors.append({"code": "unsupported_token", "message": "Unsupported function"})
        elif not _valid_arity(node.func.id, len(node.args)):
            errors.append({"code": "unsupported_token", "message": "Unsupported function arity"})
        for arg in node.args:
            _validate_node(
                arg,
                variable_codes,
                variable_types=variable_types,
                comparisons_allowed=comparisons_allowed,
                errors=errors,
            )
        if node.keywords:
            errors.append(
                {"code": "unsupported_token", "message": "Keyword arguments are unsupported"},
            )
        return
    if isinstance(node, ast.Compare):
        if not comparisons_allowed:
            errors.append(
                {
                    "code": "non_numeric_result_for_numeric_rule",
                    "message": "Comparison not allowed",
                },
            )
        _validate_node(
            node.left,
            variable_codes,
            variable_types=variable_types,
            comparisons_allowed=comparisons_allowed,
            errors=errors,
        )
        for op_node, comparator in zip(node.ops, node.comparators, strict=True):
            if type(op_node) not in COMPARISON_OPERATORS:
                errors.append({"code": "unsupported_token", "message": "Unsupported comparison"})
            _validate_node(
                comparator,
                variable_codes,
                variable_types=variable_types,
                comparisons_allowed=comparisons_allowed,
                errors=errors,
            )
        return
    errors.append(
        {"code": "unsupported_token", "message": f"Unsupported token {type(node).__name__}"},
    )


def _evaluate_node(node: ast.AST, variables: dict[str, float]) -> float | bool:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return variables[node.id]
    if isinstance(node, ast.BinOp):
        return BINARY_OPERATORS[type(node.op)](
            _evaluate_node(node.left, variables),
            _evaluate_node(node.right, variables),
        )
    if isinstance(node, ast.UnaryOp):
        return UNARY_OPERATORS[type(node.op)](_evaluate_node(node.operand, variables))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        args = [_evaluate_node(arg, variables) for arg in node.args]
        return ALLOWED_FUNCTIONS[node.func.id](*args)
    if isinstance(node, ast.Compare):
        left = _evaluate_node(node.left, variables)
        for op_node, comparator in zip(node.ops, node.comparators, strict=True):
            right = _evaluate_node(comparator, variables)
            if not COMPARISON_OPERATORS[type(op_node)](left, right):
                return False
            left = right
        return True
    raise ValueError(f"Unsupported token {type(node).__name__}")


def _is_static_zero(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Constant)
        and _is_finite_number(node.value)
        and node.value == 0
    )


def _is_finite_number(value: object) -> bool:
    return (
        isinstance(value, int | float)
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _first_invalid_number(values: dict[str, float]) -> dict[str, Any] | None:
    for key, value in values.items():
        if not _is_finite_number(value):
            return {
                "code": "non_numeric_result_for_numeric_rule",
                "message": f"Sample value for {key} must be finite numeric",
            }
    return None


def _valid_arity(function_name: str, arg_count: int) -> bool:
    minimum, maximum = FUNCTION_ARITY[function_name]
    return minimum <= arg_count <= maximum


def _resource_error(parsed: ast.AST) -> dict[str, Any] | None:
    node_count = 0
    stack: list[tuple[ast.AST, int]] = [(parsed, 1)]
    while stack:
        node, depth = stack.pop()
        node_count += 1
        if node_count > MAX_AST_NODES:
            return {"code": "unsupported_token", "message": "Expression is too complex"}
        if depth > MAX_AST_DEPTH:
            return {"code": "unsupported_token", "message": "Expression is too deeply nested"}
        stack.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
    return None


def deduplicate_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for error in errors:
        code = str(error.get("code", ""))
        if code in seen:
            continue
        seen.add(code)
        deduped.append(error)
    return deduped
