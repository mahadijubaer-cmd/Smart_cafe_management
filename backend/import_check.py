import sys
import os

# Ensure current directory is in path
sys.path.append(os.getcwd())

def check():
    try:
        # 1. Import app.models.models
        from app.models.models import Base
        
        # 2. Check metadata
        tables = Base.metadata.tables.keys()
        for t in ['orders', 'order_items', 'tables_map']:
            if t not in tables:
                return f"Failure: Metadata missing table '{t}'. Found: {list(tables)}"

        # 3. Check symbols in app.models.models
        from app.models.models import Order, OrderItem
        table_map_found = False
        for name in ['TablesMap', 'TableMap']:
            try:
                exec(f'from app.models.models import {name}')
                table_map_found = True
                model_table_class = name
                break
            except ImportError:
                continue
        if not table_map_found:
            return "Failure: Neither TablesMap nor TableMap found in app.models.models"

        # 4. Check symbols in specific modules
        try:
            from app.models.order import Order as O1, OrderItem as OI1
        except ImportError as e:
            return f"Failure: Could not import Order/OrderItem from app.models.order: {e}"
            
        try:
            if model_table_class == 'TablesMap':
                from app.models.table import TablesMap
            else:
                from app.models.table import TableMap
        except ImportError as e:
            return f"Failure: Could not import {model_table_class} from app.models.table: {e}"

        return "Success: All checks passed."
    except Exception as e:
        return f"Failure: {str(e)}"

if __name__ == '__main__':
    print(check())
