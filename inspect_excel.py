import pandas as pd
import os

folder = 'd:/USER/Desktop/KPI_OPERACIONES'
files = [f for f in os.listdir(folder) if f.endswith('.xlsx')]

for f in files:
    print(f"\n=========================================")
    print(f"File: {f}")
    path = os.path.join(folder, f)
    try:
        excel = pd.ExcelFile(path)
        print(f"Sheets: {excel.sheet_names}")
        for sheet in excel.sheet_names:
            df = pd.read_excel(path, sheet_name=sheet, nrows=5)
            print(f"\nSheet: {sheet}")
            print(f"Columns: {list(df.columns)}")
    except Exception as e:
        print(f"Error: {e}")
