import pandas as pd
import numpy as np
from nameparser import HumanName
from thefuzz import fuzz
from openpyxl import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils.dataframe import dataframe_to_rows
import openpyxl
from openpyxl.utils import get_column_letter
from copy import copy
from openpyxl.formula.translate import Translator
from openpyxl import load_workbook
from openpyxl.styles import Border, Side
from openpyxl.formula.translate import Translator

def split_race_data(file_path):
    # Load the Excel file
    df = pd.read_excel(file_path)
    
    # Identify the race type and gender markers in the first column
    race_gender_rows = df[df.iloc[:, 0].isin(['1/2 h-Lauf', 'h-Lauf', 'Männer', 'Frauen'])]
    
    # Find indices for each section start
    indices = race_gender_rows.index.tolist()
    
    # Ensure we have the correct number of race sections
    if len(indices) < 6:
        raise ValueError("File structure doesn't match expected format. Not enough sections identified.")
    
    # Function to determine race type
    def get_race_type(row):
        return '1/2 h-Lauf' if '1/2' in row.iloc[0] else 'h-Lauf'
    
    # Determine race types
    race_types = [get_race_type(df.iloc[i]) for i in indices[::3]]
    
    # Function to process a DataFrame section
    def process_section(section_df):
        # Keep only specific columns
        columns_to_keep = ["Name", "Jahrg.", "Verein", "Distanz", "Punkte"]
        section_df = section_df[columns_to_keep]
        
        # Convert data types
        section_df['Verein'] = section_df['Verein'].fillna('').astype(str)
        section_df['Jahrg.'] = pd.to_numeric(section_df['Jahrg.'], errors='coerce').astype('Int64')
        section_df['Punkte'] = pd.to_numeric(section_df['Punkte'], errors='coerce').astype('Int64')
        section_df['Distanz'] = section_df['Distanz'].astype(str).str.replace(',', '.').astype(float)  
        
        return section_df
    
    # Extract sections based on indices and race types
    sections = []
    for i in range(0, len(indices), 3):
        race_type = race_types[i // 3]
        frauen_index = indices[i + 1] if df.iloc[indices[i + 1], 0] == 'Frauen' else indices[i + 2]
        maenner_index = indices[i + 2] if df.iloc[indices[i + 2], 0] == 'Männer' else indices[i + 1]
        
        frauen = process_section(df.iloc[frauen_index + 1 : maenner_index].reset_index(drop=True))
        maenner = process_section(df.iloc[maenner_index + 1 : indices[i + 3] if i + 3 < len(indices) else None].reset_index(drop=True))
        
        sections.extend([(race_type, 'Frauen', frauen), (race_type, 'Männer', maenner)])
    
    # Sort sections to maintain consistent order
    sections.sort(key=lambda x: (x[0], x[1]))
    
    # Return the four DataFrames in the original order
    return tuple(section[2] for section in sections)

def merge_race_dataframes(df_list):
    # First, add race number to each dataframe
    for i, df in enumerate(df_list, 1):
        df['race_num'] = i
    
    # Concatenate all dataframes
    combined_df = pd.concat(df_list, ignore_index=True)
    
    # Pivot the dataframe to create separate columns for each race
    pivoted = combined_df.pivot(
        index=['Name', 'Jahrg.', 'Verein'],
        columns='race_num',
        values=['Distanz', 'Punkte']
    )
    
    # Flatten column names and rename
    pivoted.columns = [f'{col[0]} {col[1]}' for col in pivoted.columns]
    
    # Reset index to turn index back into columns
    result = pivoted.reset_index()
    
    # If there are multiple 'Verein' entries for a Name-Jahrg combination,
    # this will keep the first one encountered
    result = result.groupby(['Name', 'Jahrg.'], as_index=False).first()
    
    return result

def merge_similar_names_old(df):
    def parse_name(name):
        parsed = HumanName(name)
        return {
            'first': parsed.first,
            'middle': parsed.middle,
            'last': parsed.last,
            'full': str(parsed)
        }
    
    def calculate_similarity(name1, name2):
        parsed1 = parse_name(name1)
        parsed2 = parse_name(name2)
        
        full_sim = fuzz.ratio(parsed1['full'], parsed2['full'])
        first_sim = fuzz.ratio(parsed1['first'], parsed2['first'])
        last_sim = fuzz.ratio(parsed1['last'], parsed2['last'])
        
        return (full_sim + first_sim + last_sim) / 3
    
    def find_matches(group):
        names = group['Name'].unique()
        matches = []
        
        for i, name1 in enumerate(names):
            for name2 in names[i+1:]:
                similarity = calculate_similarity(name1, name2)
                if similarity > 80:  # Threshold can be adjusted
                    # Check if they have non-NaN values in the same columns
                    rows1 = group[group['Name'] == name1]
                    rows2 = group[group['Name'] == name2]
                    if not any((rows1[col].notna() & rows2[col].notna()).any() 
                               for col in df.columns if col not in ['Name', 'Jahrg.', 'Verein']):
                        matches.append((name1, name2))
        
        return matches
    
    def merge_matches(group, matches):
        merge_id = 0
        merge_dict = {}
        
        for name1, name2 in matches:
            if name1 not in merge_dict and name2 not in merge_dict:
                merge_id += 1
                merge_dict[name1] = merge_id
                merge_dict[name2] = merge_id
            elif name1 in merge_dict:
                merge_dict[name2] = merge_dict[name1]
            else:
                merge_dict[name1] = merge_dict[name2]
        
        group['Merge_ID'] = group['Name'].map(merge_dict)
        
        for merge_id in set(merge_dict.values()):
            mask = group['Merge_ID'] == merge_id
            merged_name = max(group.loc[mask, 'Name'], key=len)
            group.loc[mask, 'Name'] = merged_name
        
        return group
    
    # Create a copy of the input DataFrame to track merges
    df_with_merge_id = df.copy()
    
    # Group by 'Jahrg.' and apply matching/merging
    result = df.groupby('Jahrg.').apply(lambda g: merge_matches(g, find_matches(g)))
    
    # Reset index and drop the group level
    result = result.reset_index(level='Jahrg.', drop=True)
    
    # Apply the same merging process to df_with_merge_id
    df_with_merge_id = df_with_merge_id.groupby('Jahrg.').apply(lambda g: merge_matches(g, find_matches(g)))
    df_with_merge_id = df_with_merge_id.reset_index(level='Jahrg.', drop=True)
    
    return result, df_with_merge_id

def merge_similar_names(df):
    def parse_name(name):
        parsed = HumanName(name)
        return {
            'first': parsed.first,
            'middle': parsed.middle,
            'last': parsed.last,
            'full': str(parsed)
        }
    
    def calculate_similarity(name1, name2):
        parsed1 = parse_name(name1)
        parsed2 = parse_name(name2)
        
        full_sim = fuzz.ratio(parsed1['full'], parsed2['full'])
        first_sim = fuzz.ratio(parsed1['first'], parsed2['first'])
        last_sim = fuzz.ratio(parsed1['last'], parsed2['last'])
        
        return (full_sim + first_sim + last_sim) / 3
    
    def find_matches(group):
        names = group['Name'].unique()
        matches = []
        
        for i, name1 in enumerate(names):
            for name2 in names[i+1:]:
                similarity = calculate_similarity(name1, name2)
                if similarity > 80:  # Threshold can be adjusted
                    # Check if they have non-NaN values in the same columns
                    rows1 = group[group['Name'] == name1]
                    rows2 = group[group['Name'] == name2]
                    if not any((rows1[col].notna() & rows2[col].notna()).any() 
                               for col in df.columns if col not in ['Name', 'Jahrg.', 'Verein']):
                        matches.append((name1, name2))
        
        return matches
    
    def merge_names(group, matches):
        name_mapping = {}
        
        for name1, name2 in matches:
            merged_name = max(name1, name2, key=len)
            name_mapping[name1] = merged_name
            name_mapping[name2] = merged_name
        
        group['Name'] = group['Name'].map(lambda x: name_mapping.get(x, x))
        return group
    
    def assign_merge_ids(group, matches):
        merge_id = 0
        merge_dict = {}
        
        for name1, name2 in matches:
            if name1 not in merge_dict and name2 not in merge_dict:
                merge_id += 1
                merge_dict[name1] = merge_id
                merge_dict[name2] = merge_id
            elif name1 in merge_dict:
                merge_dict[name2] = merge_dict[name1]
            else:
                merge_dict[name1] = merge_dict[name2]
        
        group['Merge_ID'] = group['Name'].map(merge_dict)
        return group
    
    # Create a copy of the input DataFrame to track merges
    df_with_merge_id = df.copy()
    
    # Group by 'Jahrg.' and apply matching/merging
    result = df.groupby('Jahrg.').apply(lambda g: merge_names(g, find_matches(g)))
    result = result.reset_index(level='Jahrg.', drop=True)
    
    # Apply matching and Merge ID assignment to df_with_merge_id
    df_with_merge_id = df_with_merge_id.groupby('Jahrg.').apply(lambda g: assign_merge_ids(g, find_matches(g)))
    df_with_merge_id = df_with_merge_id.reset_index(level='Jahrg.', drop=True)
    
    return result, df_with_merge_id

def calculate_totals(df):
    # Identify 'Punkte' and 'Distanz' columns
    punkte_columns = [col for col in df.columns if col.startswith('Punkte')]
    distanz_columns = [col for col in df.columns if col.startswith('Distanz')]
    
    # Function to sum top 4 values or all available values if fewer than 4
    def sum_top_4_or_available(row):
        valid_values = row.dropna()
        if len(valid_values) <= 4:
            return valid_values.sum()
        return np.sum(np.sort(valid_values)[-4:])
    
    # Calculate total points and distance (top 4 results or all if fewer)
    df['Punkte gesamt'] = df[punkte_columns].apply(sum_top_4_or_available, axis=1)
    df['Distanz gesamt'] = df[distanz_columns].apply(sum_top_4_or_available, axis=1)
    
    # Round 'Distanz gesamt' to 2 decimal places
    df['Distanz gesamt'] = df['Distanz gesamt'].round(2)
    
    # Sort the DataFrame by 'Punkte gesamt' (descending) and 'Distanz gesamt' (descending)
    df_sorted = df.sort_values(
        by=['Punkte gesamt', 'Distanz gesamt'], 
        ascending=[False, False]
    ).reset_index(drop=True)
    
    # Calculate placement
    df_sorted['Platz'] = range(1, len(df_sorted) + 1)
    
    # Reorder columns to put 'Platz' first
    columns = df_sorted.columns
    # Start with the fixed column order: 'Platz', 'Name', 'Jahrg.', 'Verein'
    fixed_columns = ['Platz', 'Name', 'Jahrg.', 'Verein']
    
    # Extract 'Distanz' and 'Punkte' columns dynamically
    distanz_columns = sorted([col for col in columns if col.startswith('Distanz') and col != 'Distanz gesamt'])
    punkte_columns = sorted([col for col in columns if col.startswith('Punkte') and col != 'Punkte gesamt'])
    
    # Merge the 'Distanz' and 'Punkte' columns in alternating order
    merged_columns = [col for pair in zip(distanz_columns, punkte_columns) for col in pair]
    
    # Add 'Distanz gesamt' and 'Punkte gesamt' at the end
    final_columns = fixed_columns + merged_columns + ['Distanz gesamt', 'Punkte gesamt']
    df_final = df_sorted[final_columns]
    
    return df_final

def write_dfs_as_excel_tables(dfs, filepath):
    # Create a new workbook
    wb = Workbook()
    
    # Remove the default sheet created
    wb.remove(wb.active)
    
    for sheet_name, df in dfs.items():
        # Create a new sheet
        ws = wb.create_sheet(title=sheet_name)
        
        # Write the DataFrame to the sheet, including headers
        for r_idx, row in enumerate(dataframe_to_rows(df, index=False, header=True), 1):
            for c_idx, value in enumerate(row, 1):
                ws.cell(row=r_idx, column=c_idx, value=value)
        
        # Define the table range
        table_range = f"A1:{chr(64 + len(df.columns))}{len(df) + 1}"
        
        # Create a table
        tab = Table(displayName=f"Table_{sheet_name.replace(' ', '_')}", ref=table_range)
        
        # Add a default style
        style = TableStyleInfo(name="TableStyleMedium9", showFirstColumn=False,
                               showLastColumn=False, showRowStripes=True, showColumnStripes=True)
        tab.tableStyleInfo = style
        
        # Add the table to the sheet
        ws.add_table(tab)
    
    # Save the workbook
    wb.save(filepath)
    
from openpyxl import load_workbook

def apply_template_einzellauf(template_file: str, df: pd.DataFrame, output_file: str = 'updated_template.xlsx') -> str:
    """
    Function to update an Excel template with a DataFrame.
    
    Parameters:
    - template_file: str, path to the Excel template.
    - df: pd.DataFrame, data to be filled into the template.
    - output_file: str, path where the updated file will be saved (default is 'updated_template.xlsx').
    
    Returns:
    - str: path to the updated Excel file.
    """
    # Load the workbook and the specific sheet
    wb = load_workbook(template_file)
    ws = wb['Template_Einzellauf']
    
    # Define the starting row for the data (5th row in Excel)
    start_row = 5

    # Update the data from row 5 onwards (overwrite dummy row 5 and continue)
    for i, row in df.iterrows():
        # Write columns A to N (1 to 14 in zero-indexed)
        ws.cell(row=start_row + i, column=1, value=row['Platz'])
        ws.cell(row=start_row + i, column=2, value=row['Name'])
        ws.cell(row=start_row + i, column=3, value=row['Jahrg.'])
        ws.cell(row=start_row + i, column=4, value=row['Verein'])
        ws.cell(row=start_row + i, column=5, value=row['Distanz 1'])
        ws.cell(row=start_row + i, column=6, value=row['Punkte 1'])
        ws.cell(row=start_row + i, column=7, value=row['Distanz 2'])
        ws.cell(row=start_row + i, column=8, value=row['Punkte 2'])
        ws.cell(row=start_row + i, column=9, value=row['Distanz 3'])
        ws.cell(row=start_row + i, column=10, value=row['Punkte 3'])
        ws.cell(row=start_row + i, column=11, value=row['Distanz 4'])
        ws.cell(row=start_row + i, column=12, value=row['Punkte 4'])
        ws.cell(row=start_row + i, column=13, value=row['Distanz 5'])
        ws.cell(row=start_row + i, column=14, value=row['Punkte 5'])
        
        # Replicate the formulas from row 5 in columns O and P
        ws.cell(row=start_row + i, column=15).value = ws.cell(row=5, column=15).value
        ws.cell(row=start_row + i, column=16).value = ws.cell(row=5, column=16).value

    # Save the updated workbook with the specified output file name
    wb.save(output_file)

    return output_file

def output_from_template_einzellauf(template_file: str, df: pd.DataFrame, new_text_A1: str, output_file: str = 'updated_template.xlsx') -> str:
    """
    Function to update an Excel template with a DataFrame, adjusting formulas, replicating formatting,
    and applying custom text to cell A1.

    Parameters:
    - template_file: str, path to the Excel template.
    - df: pd.DataFrame, data to be filled into the template.
    - new_text_A1: str, new text to insert into cell A1.
    - output_file: str, path where the updated file will be saved (default is 'updated_template.xlsx').

    Returns:
    - str: path to the updated Excel file.
    """
    # Load the workbook and the specific sheet
    wb = load_workbook(template_file)
    ws = wb['Template_Einzellauf']

    # Update cell A1 with the provided new text
    ws['A1'].value = new_text_A1

    # Define the starting row for the data (5th row in Excel)
    start_row = 5
    template_row = 5 # Explicitly define the template row

    # Extract the formulas from columns O and P in the template row
    # Make sure these are read *before* potentially overwriting row 5 if df is not empty
    formula_O_template_str = ws.cell(row=template_row, column=15).value
    formula_P_template_str = ws.cell(row=template_row, column=16).value

    # Define border styles
    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    thick_border = Border(left=Side(style='thick'), right=Side(style='thick'), top=Side(style='thick'), bottom=Side(style='thick'))

    # Copy formatting and update data from start_row onwards
    for i, row_data in df.iterrows():
        current_row = start_row + i
        target_cell_O = f"O{current_row}"
        target_cell_P = f"P{current_row}"

        # --- Write Data Columns A to N ---
        for col_idx_offset, col_name in enumerate(df.columns[:14]): # Columns A-N correspond to indices 0-13
            col_idx = col_idx_offset + 1 # 1-based index for openpyxl
            ws.cell(row=current_row, column=col_idx, value=row_data[col_name])

            # Copy formatting from template row to current row for data columns
            cell_template = ws.cell(row=template_row, column=col_idx)
            cell = ws.cell(row=current_row, column=col_idx)
            if cell_template.has_style:
                cell.font = copy(cell_template.font)
                cell.border = copy(cell_template.border)
                cell.fill = copy(cell_template.fill)
                cell.number_format = copy(cell_template.number_format)
                cell.protection = copy(cell_template.protection)
                cell.alignment = copy(cell_template.alignment)

            # Ensure thin border is applied (overwriting copied border if needed)
            cell.border = thin_border

        # --- Handle Formula Columns O and P ---
        # Adjust the formulas using Translator
        if formula_O_template_str and isinstance(formula_O_template_str, str) and formula_O_template_str.startswith('='):
            translator_O = Translator(formula=formula_O_template_str, origin=f'O{template_row}')
            ws.cell(row=current_row, column=15, value=translator_O.translate_formula(target_cell_O))
        else:
             # If template cell doesn't contain a formula, copy the value (or handle as needed)
             ws.cell(row=current_row, column=15, value=formula_O_template_str)


        if formula_P_template_str and isinstance(formula_P_template_str, str) and formula_P_template_str.startswith('='):
            # *** This is the key change for your problem ***
            translator_P = Translator(formula=formula_P_template_str, origin=f'P{template_row}')
            # Translate the formula to the target cell (e.g., 'P6', 'P7')
            translated_formula_P = translator_P.translate_formula(target_cell_P)
            ws.cell(row=current_row, column=16, value=translated_formula_P)
            # Example: If origin='P5' and target='P6', F5 becomes F6, H5 becomes H6, but =5 stays =5
            # =WENN(ANZAHL(F6;H6;J6;L6;N6)=5;(SUMME(F6;H6;J6;L6;N6)-MIN(F6;H6;J6;L6;N6)); SUMME(F6;H6;J6;L6;N6))
        else:
            # If template cell doesn't contain a formula, copy the value
            ws.cell(row=current_row, column=16, value=formula_P_template_str)


        # Copy formatting for formula columns O and P
        for col_idx in range(15, 17): # Columns O and P
            cell_template = ws.cell(row=template_row, column=col_idx)
            cell = ws.cell(row=current_row, column=col_idx)
            if cell_template.has_style:
                cell.font = copy(cell_template.font)
                cell.border = copy(cell_template.border)
                cell.fill = copy(cell_template.fill)
                cell.number_format = copy(cell_template.number_format)
                cell.protection = copy(cell_template.protection)
                cell.alignment = copy(cell_template.alignment)

            # Apply thin border to columns O and P
            cell.border = thin_border

    # Apply thick border around the periphery of the top 3 rows of data
    # Check if there are at least 3 rows of data before applying thick border
    if len(df) >= 3:
        # Define the region: rows from start_row to start_row + 2 (3 rows) and columns 1 (A) to 16 (P)
        for row_idx_rel in range(3): # 0, 1, 2
            row = start_row + row_idx_rel
            for col in range(1, 17):  # Columns A to P (1 to 16)
                cell = ws.cell(row=row, column=col)
                current_border = copy(cell.border) # Start with existing (thin) border

                # Apply thick border only to the periphery
                new_border = Border(
                    left=thick_border.left if col == 1 else current_border.left,
                    right=thick_border.right if col == 16 else current_border.right,
                    top=thick_border.top if row_idx_rel == 0 else current_border.top,
                    bottom=thick_border.bottom if row_idx_rel == 2 else current_border.bottom
                )
                cell.border = new_border
    elif len(df) > 0: # Handle cases with 1 or 2 rows if needed, maybe apply thick border differently?
        # Optional: Add logic for fewer than 3 rows if specific bordering is desired
        pass


    # Save the updated workbook with the specified output file name
    wb.save(output_file)

    return output_file

def merge_excel_files(input_files, output_file, output_sheet_name):
    """
    Merges content from multiple Excel files into a single sheet,
    preserving values, styles, merged cells, and properly translating formulas.
    Adjusts column widths based on the maximum *explicitly set* width from input files.

    Args:
        input_files (list): A list of paths to the input Excel files.
        output_file (str): The path for the output combined Excel file.
        output_sheet_name (str): The name for the sheet in the output file.
    """
    output_wb = openpyxl.Workbook()
    output_ws = output_wb.active
    output_ws.title = output_sheet_name
    current_row_in_output = 1
    file_row_mapping = []
    # Store max *explicitly set* width found for each column index (1-based)
    max_custom_widths = {}
    overall_max_col_idx = 0 # Track the highest column index encountered

    print(f"Starting merge process for {len(input_files)} files into {output_file}...")

    for file_idx, file_path in enumerate(input_files):
        try:
            print(f"  Processing file {file_idx + 1}/{len(input_files)}: {file_path}")
            input_wb = openpyxl.load_workbook(filename=file_path)
            input_ws = input_wb.worksheets[0]
        except FileNotFoundError:
            print(f"  Warning: File not found - {file_path}. Skipping.")
            continue
        except Exception as e:
            print(f"  Warning: Error loading {file_path} - {e}. Skipping.")
            continue

        start_row_for_this_file = current_row_in_output
        max_row_in_input = input_ws.max_row
        max_col_in_input = input_ws.max_column
        overall_max_col_idx = max(overall_max_col_idx, max_col_in_input) # Update overall max column

        # --- Pass 1: Copy data, styles, formulas & collect max custom widths ---
        for r_in in range(1, max_row_in_input + 1):
            target_row = current_row_in_output
            for c_in in range(1, max_col_in_input + 1):
                input_cell = input_ws.cell(row=r_in, column=c_in)
                output_cell = output_ws.cell(row=target_row, column=c_in)
                col_letter = get_column_letter(c_in)

                # Copy Value / Translate Formula (same as before)
                if input_cell.data_type == 'f':
                    formula = input_cell.value
                    if formula and isinstance(formula, str) and formula.startswith('='):
                        origin_address = f"{col_letter}{r_in}"
                        destination_address = f"{col_letter}{target_row}"
                        try:
                            translator = Translator(formula=formula, origin=origin_address)
                            translated_formula = translator.translate_formula(destination_address)
                            output_cell.value = translated_formula
                        except Exception as e:
                            print(f"    Warning: Failed to translate formula '{formula}' from {origin_address} (file {file_path}) to {destination_address}. Copying original. Error: {e}")
                            output_cell.value = formula # Fallback
                    else:
                         output_cell.value = input_cell.value
                else:
                    output_cell.value = input_cell.value

                # Copy Style (same as before)
                if input_cell.has_style:
                    output_cell.font = copy(input_cell.font)
                    output_cell.border = copy(input_cell.border)
                    output_cell.fill = copy(input_cell.fill)
                    output_cell.number_format = copy(input_cell.number_format)
                    output_cell.protection = copy(input_cell.protection)
                    output_cell.alignment = copy(input_cell.alignment)

            current_row_in_output += 1

        # --- Collect Max Custom Widths for this file ---
        for c_idx in range(1, max_col_in_input + 1):
            col_letter = get_column_letter(c_idx)
            dim = input_ws.column_dimensions.get(col_letter)
            # Check if dimension exists AND customWidth is explicitly True
            if dim and dim.customWidth:
                width = dim.width
                if width: # Ensure width has a valid value
                    current_max = max_custom_widths.get(c_idx, 0)
                    max_custom_widths[c_idx] = max(current_max, width)
                    # print(f"    DEBUG: File {file_path}, Col {col_letter}, CustomWidth: {width}, New Max: {max_custom_widths[c_idx]}")


        # Store info needed for merged cells re-application
        file_row_mapping.append({
            'output_start_row': start_row_for_this_file,
            'input_ws': input_ws
        })

        # Add separator row
        if file_idx < len(input_files) - 1:
             # Check if last row wasn't empty before adding separator
             if max_row_in_input > 0:
                 current_row_in_output += 1

        input_wb.close()

    # --- Pass 2: Re-apply Merged Cells (same as before) ---
    print("  Applying merged cell ranges...")
    for mapping in file_row_mapping:
        output_start_row = mapping['output_start_row']
        input_ws_ref = mapping['input_ws']
        row_offset = output_start_row - 1
        for merged_range in input_ws_ref.merged_cells.ranges:
            min_col, min_row, max_col, max_row = merged_range.min_col, merged_range.min_row, merged_range.max_col, merged_range.max_row
            new_min_row = min_row + row_offset
            new_max_row = max_row + row_offset
            try:
                 output_ws.merge_cells(start_row=new_min_row, start_column=min_col,
                                       end_row=new_max_row, end_column=max_col)
            except ValueError as e:
                 print(f"    Warning: Could not merge range {get_column_letter(min_col)}{new_min_row}:{get_column_letter(max_col)}{new_max_row}. Error: {e}")
            except Exception as e:
                 print(f"    Warning: Unexpected error merging range {get_column_letter(min_col)}{new_min_row}:{get_column_letter(max_col)}{new_max_row}. Error: {e}")


    # --- Pass 3: Adjust Column Widths using Max *Custom* Widths ---
    print("  Adjusting column widths...")
    for c_idx in range(1, overall_max_col_idx + 1): # Iterate up to the max column found overall
        col_letter = get_column_letter(c_idx)
        if c_idx in max_custom_widths and max_custom_widths[c_idx] > 0:
            # Apply the max custom width found across all files
            width_to_apply = max_custom_widths[c_idx]
            output_ws.column_dimensions[col_letter].width = width_to_apply
            # print(f"  Setting Col {col_letter} width to {width_to_apply} (from max custom)")
        else:
            # If no custom width was ever set for this column in any input file,
            # leave it to Excel's default by *not* setting it here.
            # Alternatively, you could set a fallback default:
            # output_ws.column_dimensions[col_letter].width = 10 # Example fallback
            print(f"  Leaving Col {col_letter} width as default (no custom width found in inputs).")
            pass


    # --- Save the final workbook ---
    try:
        print(f"Saving merged file to {output_file}...")
        output_wb.save(output_file)
        print("Merge complete.")
    except Exception as e:
        print(f"Error saving the final merged file {output_file}: {e}")