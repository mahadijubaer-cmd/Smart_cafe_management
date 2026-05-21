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

    # Check 3: app.schemas.order.OrderResponse items/subtotal fields
    try:
        from app.schemas.order import OrderResponse
        # Check for 'items' and 'subtotal'
        # Since OrderResponse is likely a Pydantic model
        fields = OrderResponse.__fields__.keys()
        if 'items' in fields and 'subtotal' in fields:
            results.append("SUCCESS: app.schemas.order.OrderResponse includes 'items' and 'subtotal'.")
        else:
            missing = [f for f in ['items', 'subtotal'] if f not in fields]
            results.append(f"FAILURE: app.schemas.order.OrderResponse missing fields: {missing}")
    except Exception as e:
        results.append(f"FAILURE: app.schemas.order.OrderResponse check - {e}")

    return "\n".join(results)

if __name__ == '__main__':
    print(verify())
