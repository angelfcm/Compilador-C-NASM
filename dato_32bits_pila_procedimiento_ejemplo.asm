%include 'io.inc'

global CMAIN

CMAIN:

    section .text
    mov eax, 10000001_0000100_00000000_11111111b ; Valor de 32 bits usado para probar como es posible separar un dato de 32 bits en dos partes de 16 bits.
    call UPDATE_EAXH_EAXL ; rutina para recalcular la parte alta y baja de eax

    ; Se imprime el dato original para comprobarlo con el obtenido.
    PRINT_STRING "Dato original: " 
    PRINT_DEC 4, eax ;
    NEWLINE
        
    mov ax, word[eaxh] ; Imprime la parte alta del dato.
    PRINT_STRING "Parte alta: " 
    PRINT_DEC 4, ax
    NEWLINE
    
    mov ax, word[eaxl] ; Imprime la parte baja del dato.
    PRINT_STRING "Parte baja: " 
    PRINT_DEC 4, ax
    NEWLINE
    
    mov eax, 0
    mov ax, word[eaxh] ; Se mueve la parte alta obtenida al acumulador
    rol eax, 16 ; Se desplaza el acumulador 16 bits hacia la izquierda ya que es la parte alta del dato.
    mov ax, word[eaxl] ; Se agrega la parte baja del dato al acumulador para obtener el dato original.
    
    PRINT_STRING "Dato reconstruido: "
    PRINT_DEC 4, eax ; Imprime el dato calculado para comprobar que es igual al original.
    NEWLINE
    
    ; Prueba para introducir el dato de 32 bits en la pila usando la parte alta y baja
    
    push word[eaxl] ; Primero la parte baja y luego la alta para que primero se saque la alta, se desplaza a la izq. 16 bits y por último sacar la parte baja y sumarla.
    push word[eaxh]
    mov eax, 0
    pop ax
    rol eax, 16
    pop ax
    
    PRINT_STRING "Dato reconstruido pasado por la pila:"
    PRINT_DEC 4, eax

ret


; Subrutina para colocar en dos partes de 16 bits el dato de 32 bits de eax, estos se guardan en las variables eaxh (parte alta) y eaxl (parte baja).
UPDATE_EAXH_EAXL:

    section .bss
    eaxh resw 1
    eaxl resw 1
    data resd 1
    
    section .text
    mov dword[data], eax ; Copia el dato a una variable de 32 bits para poder hacer desplazamiento de direcciones.
    
    mov ax, word[data] ; Toma los primeros 16 bits del dato (parte baja) y los coloca en el acumulador de 16 bits.
    mov word[eaxl], ax ; Se copian esos 16 bits a la variable que guardará la parte baja del dato de 32bits.
    
    mov ax, word[data+2] ; Toma los otros 16 bits del dato (parte alta) y los colcoa en el acumulador de 16 bits. 
    mov word[eaxh], ax ; Se copian esos 16 bits a la variable que guardará la parte alta del dato de 32 bits.

ret