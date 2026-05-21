import sys
import os

# Ensure current directory is in path
sys.path.append(os.getcwd())

def verify():
    results = []
    
    # Check 1: app.services.order_service.OrderService
    try:
        from app.services.order_service import OrderService
        results.append("SUCCESS: app.services.order_service.OrderService imported.")
    except Exception as e:
        results.append(f"FAILURE: app.services.order_service.OrderService - {e}")

    # Check 2: app.routers.orders.router
    try:
        from app.routers.orders import router
        results.append("SUCCESS: app.routers.orders.router imported.")
    except Exception as e:
        results.append(f"FAILURE: app.routers.orders.router - {e}")

    # Check 3: app.models.order exposes Order and OrderItem
    try:
        from app.models.order import Order, OrderItem
        results.append("SUCCESS: app.models.order.Order and OrderItem imported.")
    except Exception as e:
        results.append(f"FAILURE: app.models.order symbols - {e}")

    # Check 4: app.models.table exposes TablesMap or TableMap
    try:
        try:
            from app.models.table import TablesMap
            results.append("SUCCESS: app.models.table.TablesMap imported.")
        except ImportError:
            from app.models.table import TableMap
            results.append("SUCCESS: app.models.table.TableMap imported.")
    except Exception as e:
        results.append(f"FAILURE: app.models.table symbols - {e}")

    return "\n".join(results)

if __name__ == '__main__':
    print(verify())
