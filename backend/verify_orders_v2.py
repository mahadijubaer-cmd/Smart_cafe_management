import sys
import os
from pydantic import BaseModel

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

    # Check 3: app.schemas.order.OrderResponse and OrderItemResponse
    try:
        from app.schemas.order import OrderResponse, OrderItemResponse
        
        # Check OrderResponse fields
        if hasattr(OrderResponse, 'model_fields'):
            resp_fields = OrderResponse.model_fields
            item_fields = OrderItemResponse.model_fields
        else:
            resp_fields = OrderResponse.__fields__
            item_fields = OrderItemResponse.__fields__

        if 'items' in resp_fields:
            results.append("SUCCESS: OrderResponse includes 'items' field.")
            
            # Check if items list contains OrderItemResponse or similar and it has subtotal
            if 'subtotal' in item_fields:
                results.append("SUCCESS: OrderItemResponse (nested in items) includes 'subtotal' field.")
            else:
                results.append("FAILURE: OrderItemResponse missing 'subtotal' field.")
        else:
            results.append("FAILURE: OrderResponse missing 'items' field.")
            
    except Exception as e:
        results.append(f"FAILURE: app.schemas.order check - {e}")

    return "\n".join(results)

if __name__ == '__main__':
    print(verify())
