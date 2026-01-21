import { TextField, MenuItem } from "@mui/material";
import React from "react";
import "./dropdown.scss";

interface DropdownOption {
  value: string | number;
  label: string;
  labelNode?: React.ReactNode;
}

interface DropdownProps {
  label: string;
  value: string | number | null;
  options: DropdownOption[];
  onChange: (value: string | number) => void;
  size?: "small" | "medium";
  disabled?: boolean;
}

const Dropdown: React.FC<DropdownProps> = ({
  label,
  value,
  options,
  onChange,
  size = "small",
  disabled = false
}) => {
  return (
    <TextField
      select
      fullWidth
      label={label}
      value={value ?? ""}
      onChange={(e: any) => {
        const selected = e.target.value;
        const isNumber = options.some(opt => typeof opt.value === "number");
        onChange(isNumber ? Number(selected) : selected);
      }}
      size={size}
      disabled={disabled}
      className={`${disabled ? "disabled-dropdown" : ""}`}
    >
      {options.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.labelNode ?? opt.label}
        </MenuItem>
      ))}
    </TextField>
  );
};

export default Dropdown;
